/* eslint-disable no-mixed-operators */
/* eslint-disable no-bitwise */
/* eslint-disable one-var */

import { sleep, group, check } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';
import { setApiKeyAccessTokenAndHost } from '../../utils/helpers.js';
const myFailRate = new Rate('failed requests');

const credentials = JSON.parse(open('../../utils/credentials.json'));
console.log(`credentials.key_id: ${credentials.key_id}`);

if (!__ENV.VIRTUAL_USERS) {
  __ENV.VIRTUAL_USERS = JSON.stringify([
    { "duration": "1s", "target": 1 },
    { "duration": "5s", "target": 5 },
    { "duration": "300s", "target": 10 }
  ]);
}
console.log(`VIRTUAL_USERS: ${__ENV.VIRTUAL_USERS}`);

const GOOGLE_PROJECTS_LIST = __ENV.GOOGLE_PROJECTS_LIST || 'Proj1,Proj2,Proj3';
const googleProjects = GOOGLE_PROJECTS_LIST.split(',');

export const options = {
  tags: {
    test_scenario: 'Fence - Patch service account',
    release: __ENV.RELEASE_VERSION,
    test_run_id: (new Date()).toISOString().slice(0, 16),
  },
  stages: JSON.parse(__ENV.VIRTUAL_USERS),
  thresholds: {
    http_req_duration: ['avg<3000', 'p(95)<15000'],
    'failed requests': ['rate<0.1'],
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
  const url = `https://${env.GEN3_HOST}/user/google/service_accounts/${env.GOOGLE_SVC_ACCOUNT}`;
  console.log(`sending req to: ${url}`);
  const params = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.ACCESS_TOKEN}`,
    },
    tags: { name: 'GoogleSvcAccountPatch' }
  };
  const body = {
    project_access: googleProjects.splice(
      Math.floor(Math.random() * googleProjects.length),
      Math.floor(Math.random() * googleProjects.length),
    ),
  };
  console.log(`patching with project_access: ${JSON.stringify(body)}`);

  group('Sending PATCH google svc account request', () => {
    group('http patch', () => {
      // console.log(`Shooting requests against: ${url}`);
      const res = http.patch(url, body, params);
      // console.log(`Request performed: ${new Date()}`);
      myFailRate.add(res.status !== 204);
      if (res.status !== 204) {
        console.log(`Request response: ${res.status}`);
        console.log(`Request response: ${res.body}`);
      }
      check(res, {
        'is status 204': (r) => r.status === 204,
      });
    });
    group('wait 0.3s between requests', () => {
      sleep(0.3);
    });
  });
}
