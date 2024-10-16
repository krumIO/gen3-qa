/* eslint-disable no-mixed-operators */
/* eslint-disable no-bitwise */
/* eslint-disable one-var */

import { sleep, group, check } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';
import { getCommonVariables, setAccessTokenFromApiKey, uuidv4 } from '../../utils/helpers.js';
const myFailRate = new Rate('failed_requests');

const credentials = JSON.parse(open('../../utils/credentials.json'));
console.log(`credentials.key_id: ${credentials.key_id}`);

if (!__ENV.VIRTUAL_USERS) {
  __ENV.VIRTUAL_USERS = JSON.stringify([
    { "target": 1 }
  ]);
}
console.log(`VIRTUAL_USERS: ${__ENV.VIRTUAL_USERS}`);

export const options = {
  tags: {
    test_scenario: 'Indexd - Create records',
    release: __ENV.RELEASE_VERSION,
    test_run_id: (new Date()).toISOString().slice(0, 16),
  },
  stages: JSON.parse(__ENV.VIRTUAL_USERS),
  thresholds: {
    http_req_duration: ['avg<3000', 'p(95)<15000'],
    'failed_requests': ['rate<0.1'],
  },
  noConnectionReuse: true,
};

export function setup() {
  return getCommonVariables(__ENV, credentials);
}

export default function (env) {
  const url = `${env.GEN3_HOST}/index/index`;
  // console.log(`sending req to: ${url}`);
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${__ENV.ACCESS_TOKEN}`,
    },
    tags: { name: 'Indexd-record-creation' }
  };
  const body = {
    acl: ['QA'],
    authz: [],
    did: uuidv4(),
    file_name: 'qa-test.txt',
    form: 'object',
    hashes: {
      md5: '404e8919021a03285697647487f528ef',
    },
    size: 2681688756,
    urls: ['gs://dcf-integration-qa/qa-test.txt', 's3://cdis-presigned-url-test/testdata'],
  };

  const strBody = JSON.stringify(body);
  // console.log(`debugging: ${JSON.stringify(body)}`);

  console.log(`submitting: ${__ITER}`); // eslint-disable-line no-undef

  group('Creating indexd records', () => {
    console.log(`sending POST req to: ${url}`);
    const res = http.post(url, strBody, params);

    // If the ACCESS_TOKEN expires, renew it with the apiKey
    if (res.status === 401) {
      console.log('renewing access token!!!');
      console.log(`Request response: ${res.status}`);
      console.log(`Request response: ${res.body}`);

      const params = {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        tags: { name: 'renewingToken1' }
      };
      setAccessTokenFromApiKey(env, params);

      console.log(`NEW ACCESS TOKEN!: ${env.ACCESS_TOKEN}`);
    } else {
      // console.log(`Request performed: ${new Date()}`);
      console.log(`Request response: ${res.status}`);
      myFailRate.add(res.status !== 200);
      if (res.status !== 200) {
        console.log(`Request response: ${res.status}`);
        console.log(`Request response: ${res.body}`);
      }
      check(res, {
        'is status 200': (r) => r.status === 200,
      });
    }
    group('wait 0.1s between requests', () => {
      sleep(0.1);
    });
    // } else {
    //   fail(`${__ITER} records created on ${GEN3_HOST}`); // eslint-disable-line no-undef
    // }
  });
}
