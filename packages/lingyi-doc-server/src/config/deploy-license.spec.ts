import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { issueLicense } from '@lingyi-doc/license';
import {
  loadDeployLicenseResult,
  signLicensePayload,
  verifyLicenseSignature,
  LICENSE_UNAVAILABLE_MESSAGE,
} from './deploy-license';

describe('deploy-license adapter', () => {
  it('returns absent when unset', () => {
    assert.equal(loadDeployLicenseResult({}).status, 'absent');
  });

  it('filters to MembershipModuleKey on ok', () => {
    const result = loadDeployLicenseResult({
      licensePayload: JSON.stringify({
        modules: ['mod.doc', 'mod.sheet', 'bogus'],
        expireAt: '2099-01-01T00:00:00.000Z',
      }),
    });
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.license!.modules, ['mod.doc', 'mod.sheet']);
  });

  it('returns expired status instead of falling open', () => {
    const secret = 'sec';
    const issued = issueLicense({
      secret,
      modules: ['mod.doc', 'mod.ai'],
      expireAt: '2020-01-01T00:00:00.000Z',
    });
    const result = loadDeployLicenseResult({
      licensePayload: JSON.stringify(issued),
      licenseSecret: secret,
      now: new Date('2026-07-20T00:00:00.000Z'),
    });
    assert.equal(result.status, 'expired');
    assert.deepEqual(result.license!.modules, []);
  });

  it('returns invalid on signature mismatch', () => {
    const issued = issueLicense({
      secret: 'right',
      modules: ['mod.doc'],
      expireAt: '2099-01-01T00:00:00.000Z',
    });
    const result = loadDeployLicenseResult({
      licensePayload: JSON.stringify(issued),
      licenseSecret: 'wrong',
    });
    assert.equal(result.status, 'invalid');
    assert.equal(result.reason, 'signature_invalid');
  });

  it('verifies signed payload via shared library', () => {
    const secret = 'test-secret-key-12345';
    const payload = {
      modules: ['mod.doc', 'mod.sheet'],
      expireAt: '2099-01-01T00:00:00.000Z',
      tenantId: 'tenant_001',
      seats: 50,
    };
    const signature = signLicensePayload(payload, secret);
    assert.ok(verifyLicenseSignature({ ...payload, signature }, secret));

    const result = loadDeployLicenseResult({
      licensePayload: JSON.stringify({ ...payload, signature }),
      licenseSecret: secret,
    });
    assert.equal(result.status, 'ok');
    assert.equal(result.license!.seats, 50);
  });

  it('exposes unified user message constant', () => {
    assert.match(LICENSE_UNAVAILABLE_MESSAGE, /授权/);
  });
});
