import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuth} from './auth.mjs';

test('login accepts only the configured username and password',()=>{
  const auth=createAuth({username:'test-user',password:'test-password',secret:'test-secret'});
  assert.equal(auth.credentialsMatch('test-user','test-password'),true);
  assert.equal(auth.credentialsMatch('test-user','wrong'),false);
  assert.equal(auth.credentialsMatch('other','test-password'),false);
});

test('signed sessions expire and reject tampering',()=>{
  const auth=createAuth({username:'test-user',password:'test-password',secret:'test-secret'});
  const token=auth.issue(1000,5000);
  assert.equal(auth.validate(token,2000).u,'test-user');
  assert.equal(auth.validate(`${token}x`,2000),null);
  assert.equal(auth.validate(token,7000),null);
});

test('sha256 password configuration avoids storing plaintext',()=>{
  const auth=createAuth({username:'test-user',passwordHash:'c638833f69bbfb3c267afa0a74434812436b8f08a81fd263c6be6871de4f1265',secret:'test-secret'});
  assert.equal(auth.credentialsMatch('test-user','test-password'),true);
});
