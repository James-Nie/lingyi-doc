import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModuleMap,
  hasModule,
  isMembershipModuleKey,
  moduleForDocType,
  MODULE_LABELS,
  parseEnabledModulesConfig,
  ALL_MEMBERSHIP_MODULES,
  COMMUNITY_MODULES,
  resolveModuleMap,
} from './membership-modules';

describe('membership-modules', () => {
  it('maps doc types to modules', () => {
    assert.equal(moduleForDocType('richtext'), 'mod.doc');
    assert.equal(moduleForDocType('freeform'), 'mod.sheet');
    assert.equal(moduleForDocType('base'), 'mod.sheet');
    assert.equal(moduleForDocType('whiteboard'), 'mod.whiteboard');
    assert.equal(moduleForDocType('mindnote'), 'mod.mindmap');
    assert.equal(moduleForDocType('questionnaire'), 'mod.form');
    assert.equal(moduleForDocType('unknown-x'), 'mod.doc');
  });

  it('parses ENABLED_MODULES', () => {
    assert.equal(parseEnabledModulesConfig(undefined), null);
    assert.equal(parseEnabledModulesConfig(''), null);
    assert.equal(parseEnabledModulesConfig('*'), null);
    assert.deepEqual(parseEnabledModulesConfig('mod.doc, mod.sheet'), ['mod.doc', 'mod.sheet']);
    assert.deepEqual(parseEnabledModulesConfig('mod.doc,bogus'), ['mod.doc']);
  });

  it('buildModuleMap defaults to all enabled', () => {
    const map = buildModuleMap(null);
    for (const key of ALL_MEMBERSHIP_MODULES) {
      assert.equal(map[key], true);
    }
  });

  it('buildModuleMap intersects with override', () => {
    const map = buildModuleMap(['mod.doc', 'mod.sheet']);
    assert.equal(hasModule(map, 'mod.doc'), true);
    assert.equal(hasModule(map, 'mod.sheet'), true);
    assert.equal(hasModule(map, 'mod.whiteboard'), false);
    assert.equal(hasModule(map, 'mod.ai'), false);
  });

  it('validates module keys and labels', () => {
    assert.equal(isMembershipModuleKey('mod.doc'), true);
    assert.equal(isMembershipModuleKey('mod.foo'), false);
    assert.match(MODULE_LABELS['mod.whiteboard'], /白板/);
  });

  it('community edition disables commercial modules', () => {
    const map = resolveModuleMap({ edition: 'community' });
    assert.equal(map['mod.doc'], true);
    assert.equal(map['mod.sheet'], true);
    assert.equal(map['mod.mindmap'], true);
    assert.equal(map['mod.ai'], false);
    assert.equal(map['mod.mcp'], false);
    assert.equal(map['mod.enterprise'], false);
    for (const key of COMMUNITY_MODULES) {
      assert.equal(map[key], true, key);
    }
  });

  it('enabledModules override wins over community base via intersection', () => {
    const map = resolveModuleMap({
      edition: 'community',
      enabledOverride: ['mod.doc', 'mod.ai'],
    });
    assert.equal(map['mod.doc'], true);
    assert.equal(map['mod.ai'], false); // ai not in community
    assert.equal(map['mod.sheet'], false);
  });

  it('saas edition stays full-open without override', () => {
    const map = resolveModuleMap({ edition: 'saas' });
    assert.equal(map['mod.ai'], true);
    assert.equal(map['mod.mcp'], true);
  });
});
