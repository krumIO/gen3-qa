/* eslint-disable no-mixed-operators */
/* eslint-disable no-bitwise */
/* eslint-disable one-var */

import { sleep, group, check } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';
import { setApiKeyAccessTokenAndHost } from '../../utils/helpers.js';

const credentials = JSON.parse(open('../../utils/credentials.json'));
console.log(`credentials.key_id: ${credentials.key_id}`);

if (!__ENV.VIRTUAL_USERS) {
  __ENV.VIRTUAL_USERS = JSON.stringify([
    { "duration": "5s", "target": 1 },
    { "duration": "10s", "target": 10 },
    { "duration": "120s", "target": 100 },
    { "duration": "120s", "target": 300 },
    { "duration": "30s", "target": 1 },
  ] );
}
console.log(`VIRTUAL_USERS: ${__ENV.VIRTUAL_USERS}`);

// __ENV.GUIDS_LIST should contain either a list of GUIDs from load-test-descriptor.json
// or it should be assembled based on an indexd query (requires `indexd_record_url` to fetch DIDs)
const GUIDS_LIST = __ENV.GUIDS_LIST || 'PREFIX/b136c3ad-fda7-4bb2-8cc1-9c564c8d9675,PREFIX/ec911cc2-2f5b-4c8f-8a2c-f3845599806c,PREFIX/4b1f5e2e-40e7-4346-876b-2170a0f02833,PREFIX/591a3584-4845-4223-b685-0b93d2984bbb,PREFIX/24077849-81d6-4650-b232-155494d17322,PREFIX/d9932f1c-30e9-4d39-984d-3e9e43cf05e1,PREFIX/9acfc027-ee94-4517-9708-3d441452dd55';
const guids = GUIDS_LIST.split(',');

const myFailRate = new Rate('failed_requests');

export const options = {
  tags: {
    test_scenario: 'Fence - Presigned URL',
    release: __ENV.RELEASE_VERSION,
    test_run_id: (new Date()).toISOString().slice(0, 16),
  },
  rps: 90000,
  stages: JSON.parse(__ENV.VIRTUAL_USERS),
  thresholds: {
    http_req_duration: ['avg<3000', 'p(95)<15000'],
    'failed_requests': ['rate<0.1'],
  },
  noConnectionReuse: true,
};

export function setup() {
  console.log("ENTERING SETUP");
  setApiKeyAccessTokenAndHost(__ENV, credentials);
  console.log("EXITTINNG SETUP");
  return __ENV;
}

export default function (env) {
  const url = `https://${env.GEN3_HOST}/user/data/download/${guids[Math.floor(Math.random() * guids.length)]}`;
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.ACCESS_TOKEN}`,
    },
    tags: { name: 'PreSignedURL' }
  };
  group('Sending PreSigned URL request', () => {
    group('http get', () => {
      console.log(`Shooting requests against: ${url}`);
      const res = http.get(url, params, {  });
      // console.log(`Request performed: ${new Date()}`);
      myFailRate.add(res.status !== 200);
      if (res.status !== 200) {
        console.log(`Request response: ${res.status}`);
        console.log(`Request response: ${res.body}`);
      }
      check(res, {
        'is status 200': (r) => r.status === 200,
      });
    });
    group('wait 0.3s between requests', () => {
      sleep(0.3);
    });
  });
}
