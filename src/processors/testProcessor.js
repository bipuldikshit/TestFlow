const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const Test = require('../models/Test');
const TestResult = require('../models/TestResult');
const SocketService = require('../services/socketService');
const logger = require('../utils/logger');

module.exports = async (job) => {
  const { testId, triggeredBy, regions } = job.data;
  
  try {
    logger.info(`Processing test execution job: ${testId}`);
    
    // Get test configuration
    const test = await Test.findById(testId).populate('project');
    if (!test) {
      throw new Error('Test not found');
    }

    // Execute test in all specified regions
    const results = await Promise.allSettled(
      regions.map(region => executeTestInRegion(test, region, triggeredBy))
    );

    // Update test statistics
    await updateTestStats(test, results);
    
    logger.info(`Test execution completed: ${testId}`);
    return { testId, results: results.length };
    
  } catch (error) {
    logger.error(`Test execution failed: ${testId}`, error);
    throw error;
  }
};

async function executeTestInRegion(test, region, triggeredBy) {
  const executionId = uuidv4();
  const startTime = new Date();
  
  // Create initial test result
  const testResult = new TestResult({
    test: test._id,
    project: test.project._id,
    executionId,
    status: 'running',
    startTime,
    region,
    metadata: {
      triggeredBy,
      retryCount: 0
    }
  });
  
  await testResult.save();
  
  // Emit real-time update
  SocketService.emitTestResult(testResult);
  
  try {
    // Prepare request configuration
    const requestConfig = {
      method: test.config.method,
      url: test.config.url,
      timeout: test.config.timeout,
      headers: {
        'User-Agent': 'TestFlow/1.0',
        ...Object.fromEntries(test.config.headers)
      }
    };

    // Add authentication
    if (test.config.auth && test.config.auth.type !== 'none') {
      applyAuthentication(requestConfig, test.config.auth);
    }

    // Add request body if needed
    if (['POST', 'PUT', 'PATCH'].includes(test.config.method) && test.config.body) {
      requestConfig.data = test.config.body;
    }

    // Execute HTTP request
    const response = await axios(requestConfig);
    
    const endTime = new Date();
    const duration = endTime - startTime;
    
    // Update test result with response
    testResult.status = 'passed';
    testResult.endTime = endTime;
    testResult.duration = duration;
    testResult.response = {
      statusCode: response.status,
      headers: new Map(Object.entries(response.headers)),
      body: response.data,
      size: JSON.stringify(response.data).length,
      responseTime: duration
    };
    
    // Run assertions
    const assertionResults = await runAssertions(test.assertions, response, duration);
    testResult.assertions = assertionResults;
    
    // Check if any assertions failed
    const hasFailedAssertions = assertionResults.some(assertion => !assertion.passed);
    if (hasFailedAssertions) {
      testResult.status = 'failed';
    }
    
  } catch (error) {
    const endTime = new Date();
    const duration = endTime - startTime;
    
    testResult.status = error.code === 'ECONNABORTED' ? 'timeout' : 'error';
    testResult.endTime = endTime;
    testResult.duration = duration;
    testResult.error = {
      message: error.message,
      code: error.code,
      stack: error.stack
    };
    
    if (error.response) {
      testResult.response = {
        statusCode: error.response.status,
        headers: new Map(Object.entries(error.response.headers || {})),
        body: error.response.data,
        responseTime: duration
      };
    }
  }
  
  await testResult.save();
  
  // Emit final result
  SocketService.emitTestResult(testResult);
  
  return testResult;
}

function applyAuthentication(requestConfig, auth) {
  switch (auth.type) {
    case 'bearer':
      requestConfig.headers.Authorization = `Bearer ${auth.credentials.token}`;
      break;
    case 'basic':
      const encoded = Buffer.from(`${auth.credentials.username}:${auth.credentials.password}`).toString('base64');
      requestConfig.headers.Authorization = `Basic ${encoded}`;
      break;
    case 'apikey':
      if (auth.credentials.location === 'header') {
        requestConfig.headers[auth.credentials.key] = auth.credentials.value;
      } else if (auth.credentials.location === 'query') {
        requestConfig.params = requestConfig.params || {};
        requestConfig.params[auth.credentials.key] = auth.credentials.value;
      }
      break;
  }
}

async function runAssertions(assertions, response, duration) {
  const results = [];
  
  for (const assertion of assertions) {
    const result = {
      type: assertion.type,
      description: assertion.description,
      passed: false,
      expected: assertion.value,
      actual: null,
      error: null
    };
    
    try {
      switch (assertion.type) {
        case 'status':
          result.actual = response.status;
          result.passed = evaluateAssertion(response.status, assertion.operator, assertion.value);
          break;
          
        case 'response_time':
          result.actual = duration;
          result.passed = evaluateAssertion(duration, assertion.operator, assertion.value);
          break;
          
        case 'body_contains':
          const bodyString = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
          result.actual = bodyString;
          result.passed = bodyString.includes(assertion.value);
          break;
          
        case 'header_exists':
          result.actual = response.headers[assertion.field.toLowerCase()];
          result.passed = !!response.headers[assertion.field.toLowerCase()];
          break;
          
        case 'json_path':
          const jsonValue = getJsonPath(response.data, assertion.field);
          result.actual = jsonValue;
          result.passed = evaluateAssertion(jsonValue, assertion.operator, assertion.value);
          break;
          
        default:
          result.error = `Unknown assertion type: ${assertion.type}`;
      }
    } catch (error) {
      result.error = error.message;
    }
    
    results.push(result);
  }
  
  return results;
}

function evaluateAssertion(actual, operator, expected) {
  switch (operator) {
    case 'equals':
      return actual == expected;
    case 'not_equals':
      return actual != expected;
    case 'contains':
      return String(actual).includes(String(expected));
    case 'not_contains':
      return !String(actual).includes(String(expected));
    case 'greater_than':
      return Number(actual) > Number(expected);
    case 'less_than':
      return Number(actual) < Number(expected);
    case 'exists':
      return actual !== null && actual !== undefined;
    case 'not_exists':
      return actual === null || actual === undefined;
    default:
      return false;
  }
}

function getJsonPath(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
}

async function updateTestStats(test, results) {
  const successfulResults = results.filter(r => r.status === 'fulfilled' && r.value.status === 'passed');
  const totalResults = results.length;
  
  test.stats.totalRuns += totalResults;
  test.stats.successRate = (test.stats.successRate * (test.stats.totalRuns - totalResults) + successfulResults.length) / test.stats.totalRuns;
  test.stats.lastRun = new Date();
  test.stats.lastStatus = successfulResults.length === totalResults ? 'passed' : 'failed';
  
  if (results.length > 0 && results[0].status === 'fulfilled') {
    const avgResponseTime = results
      .filter(r => r.status === 'fulfilled')
      .reduce((sum, r) => sum + r.value.duration, 0) / results.filter(r => r.status === 'fulfilled').length;
    
    test.stats.avgResponseTime = avgResponseTime;
  }
  
  await test.save();
}