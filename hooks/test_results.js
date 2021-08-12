const { event } = require('codeceptjs');
const request = require('request');
const Influx = require('influx');
const fetch = require('node-fetch');
const os = require('os');
const StatsD = require('hot-shots');
// const stringify = require('json-stringify-safe');

const influx = new Influx.InfluxDB({
  host: 'influxdb',
  database: 'ci_metrics',
});

const testEnvironment = process.env.KUBECTL_NAMESPACE || os.hostname();

let ddClient;
if (!process.env.JENKINS_HOME && process.env.RUNNING_LOCAL !== 'true') {
  ddClient = new StatsD({
    host: 'datadog-agent-cluster-agent.datadog',
    port: 8125,
    globalTags: { env: testEnvironment },
    errorHandler(error) {
      console.log('Socket errors caught here: ', error);
    },
  });
}

async function fetchJenkinsMetrics() {
  const username = process.env.JENKINS_USERNAME;
  const password = process.env.JENKINS_USER_API_TOKEN;
  const url = 'https://jenkins.planx-pla.net/scriptText';
  const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const queueLength = await request({
    url,
    body: 'script=println(Hudson.instance.queue.items.length)',
    headers: {
      Authorization: auth,
    },
  },
  (error, response, body) => {
    if (!error && response.statusCode === 200) {
      return body;
    }
    console.log(`error: ${error}`);
    return null;
  });

  return queueLength;
}

async function writeMetrics(measurement, test, currentRetry) {
  // test metrics
  const suiteName = test.parent.title.split(' ').join('_');
  const testName = test.title.split(' ').join('_');
  const ciEnvironment = process.env.KUBECTL_NAMESPACE;
  const duration = test.duration / 1000;

  // github metrics
  let prName = '';
  let repoName = '';
  try {
    prName = process.env.BRANCH_NAME.split('-')[1]; // eslint-disable-line prefer-destructuring
    repoName = process.env.JOB_NAME.split('/')[1]; // eslint-disable-line prefer-destructuring
  } catch {
    prName = 'UNDEFINED';
    repoName = 'UNDEFINED';
  }

  // selenium metrics
  let sessionCount = 0;
  if (process.env.RUNNING_IN_PROD_TIER === 'true') {
    console.log('INFO: Running in prod-tier environment. Ignore selenium-hub metrics.');
  } else {
    const resp = await fetch('http://selenium-hub:4444/status');
    const respJson = await resp.json();

    const { nodes } = respJson.value;
    if (nodes.length > 0) {
      nodes.forEach((node) => {
        node.slots.forEach((slot) => {
          if (slot.session) {
            sessionCount += 1;
          }
        });
      });
    }
  }

  // Jenkins metrics
  const numberOfPRsWaitingInTheQueue = await fetchJenkinsMetrics();

  // logs
  console.log('********');
  console.log(`TEST: ${testName}`);
  console.log(`RESULT: ${test.state}`);
  console.log(`CURRENT RETRY - ${currentRetry}`);
  console.log(`TIMESTAMP: ${new Date()}`);
  console.log(`GRID_SESSION_COUNT: ${sessionCount}`);
  console.log(`JENKINS_QUEUE_LENGTH: ${JSON.stringify(numberOfPRsWaitingInTheQueue)}`);
  console.log(`TEST_DURATION: ${duration}s`);
  console.log('********');

  // define information to write into time-series db
  const fieldInfo = measurement === 'run_time' ? duration : 1;

  const tsData = {};
  tsData[measurement] = fieldInfo;
  const metricTags = {
    repo_name: repoName,
    pr_num: prName,
    suite_name: suiteName,
    test_name: testName,
    ci_environment: ciEnvironment,
    selenium_grid_sessions: sessionCount,
    run_time: duration,
  };

  // writing metrics to influxdb
  await influx.writePoints(
    [{
      measurement,
      tags: metricTags,
      fields: tsData,
    }],
    { precision: 's' },
  ).catch((err) => {
    console.error(`Error saving data to InfluxDB! ${err}`);
  });

  // writing metrics to DataDog if ddClient is initialized
  if (ddClient) {
    ddClient.increment(`planx.ci.${measurement}`, metricTags);
  }
}

module.exports = function () {
  event.dispatcher.on(event.test.after, async (test) => {
    // console.log(stringify(test));
    const testResult = test.state;
    // eslint-disable-next-line no-underscore-dangle
    const retries = test._retries;
    // eslint-disable-next-line no-underscore-dangle
    const currentRetry = test._currentRetry;
    if (testResult === 'failed' && retries <= currentRetry) {
      await writeMetrics('fail_count', test, currentRetry);
    }
    if (testResult === 'passed') {
      await writeMetrics('pass_count', test, currentRetry);
    }
    if (currentRetry > 0 && (testResult === 'passed' || retries === currentRetry)) {
      await writeMetrics('retry_count', test, currentRetry);
    }
    if (testResult === undefined) {
      // If there are any Selenium failures, we cannot let the test fail silently.
      // We need to force return an exit code 1.
      throw new Error('THE TEST RESULT IS UNDEFINED! ABORT ALL TESTS AND FAIL THIS PR.');
    }
    await writeMetrics('run_time', test, currentRetry);
  });

  event.dispatcher.on(event.suite.before, (suite) => {
    console.log('********');
    console.log(`SUITE: ${suite.title}`);
    if (suite.title === 'DrsAPI') {
      request(`https://${process.env.HOSTNAME}/index/ga4gh/drs/v1/objects`, { json: true }, (err, res) => {
        if (err) { console.log(err); }
        if (res.statusCode !== 200) {
          console.log('Skipping DRS tests since its endpoints are not enabled on this environment...');
          suite.tests.forEach((test) => {
            test.run = function skip() { // eslint-disable-line func-names
              console.log(`Ignoring test - ${test.title}`);
              this.skip();
            };
          });
        }
      });
    }
    // Not all environments that are tested through the nightly build support the PFB Export feature
    if (suite.title === 'PFB Export') {
      request(`https://${process.env.HOSTNAME}/data/config/gitops.json`, { json: true }, (err, res) => {
        if (err) { console.log(err); }
        let areThereAnyExportToPFBButtons = false;
        if (res.statusCode === 200 && Object.prototype.hasOwnProperty.call(res.body, 'explorerConfig')) {
          res.body.explorerConfig.forEach((config) => {
            console.log(`looking for export-to-pfb buttons in config: ${config.tabTitle}`);
            config.buttons.forEach((button) => {
              console.log(`## ### BUTTON : ${JSON.stringify(button)}`);
              if (button.type === 'export-to-pfb') {
                areThereAnyExportToPFBButtons = true;
              }
            });
          });
        }
        if (!areThereAnyExportToPFBButtons) {
          console.log('Skipping PFB Export test scenarios since its config does not contain any export-to-pfb buttons...');
          suite.tests.forEach((test) => {
            test.run = function skip() { // eslint-disable-line func-names
              console.log(`Ignoring test - ${test.title}`);
              this.skip();
            };
          });
        }
      });
    }
  });
};
