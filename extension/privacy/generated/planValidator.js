var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// extension/privacy/generated/.tmp/planValidator.input.js
var validate = validate20;
var planValidator_input_default = validate20;
var schema33 = { "title": "Action", "type": "object", "additionalProperties": false, "required": ["action"], "properties": { "action": { "$ref": "#/$defs/actionName" }, "target": { "$ref": "#/$defs/target" }, "text": { "type": "string", "description": "type only. May contain [[PII:TYPE:xxxxxxxx]] tokens, re-hydrated locally under strict rules." }, "value": { "type": "string", "description": "select only." }, "direction": { "type": "string", "enum": ["up", "down"], "description": "scroll only." }, "amount": { "type": "integer", "description": "scroll only." }, "key": { "type": "string", "description": "key only." }, "ms": { "type": "integer", "minimum": 0, "description": "wait only." }, "url": { "type": "string", "description": "navigate only. Never re-hydrated." }, "reason": { "type": "string", "description": "Human-readable justification. Required for ask_user and fail." }, "expect": { "$ref": "#/$defs/expect" }, "evidence": { "$ref": "#/$defs/expect" } }, "allOf": [{ "if": { "properties": { "action": { "enum": ["click", "type", "select", "check", "hover"] } }, "required": ["action"] }, "then": { "required": ["target"] } }, { "if": { "properties": { "action": { "const": "type" } }, "required": ["action"] }, "then": { "required": ["text"] } }, { "if": { "properties": { "action": { "const": "select" } }, "required": ["action"] }, "then": { "required": ["value"] } }, { "if": { "properties": { "action": { "const": "scroll" } }, "required": ["action"] }, "then": { "required": ["direction", "amount"] } }, { "if": { "properties": { "action": { "const": "key" } }, "required": ["action"] }, "then": { "required": ["key"] } }, { "if": { "properties": { "action": { "const": "wait" } }, "required": ["action"] }, "then": { "required": ["ms"] } }, { "if": { "properties": { "action": { "const": "navigate" } }, "required": ["action"] }, "then": { "required": ["url"] } }, { "if": { "properties": { "action": { "enum": ["ask_user", "fail"] } }, "required": ["action"] }, "then": { "required": ["reason"] } }, { "if": { "properties": { "action": { "const": "done" } }, "required": ["action"] }, "then": { "required": ["evidence"] } }, { "if": { "properties": { "action": { "const": "click" } }, "required": ["action"] }, "then": { "not": { "anyOf": [{ "required": ["text"] }, { "required": ["value"] }, { "required": ["direction"] }, { "required": ["amount"] }, { "required": ["key"] }, { "required": ["ms"] }, { "required": ["url"] }, { "required": ["reason"] }, { "required": ["evidence"] }] } } }, { "if": { "properties": { "action": { "const": "type" } }, "required": ["action"] }, "then": { "not": { "anyOf": [{ "required": ["value"] }, { "required": ["direction"] }, { "required": ["amount"] }, { "required": ["key"] }, { "required": ["ms"] }, { "required": ["url"] }, { "required": ["reason"] }, { "required": ["evidence"] }] } } }, { "if": { "properties": { "action": { "const": "select" } }, "required": ["action"] }, "then": { "not": { "anyOf": [{ "required": ["text"] }, { "required": ["direction"] }, { "required": ["amount"] }, { "required": ["key"] }, { "required": ["ms"] }, { "required": ["url"] }, { "required": ["reason"] }, { "required": ["evidence"] }] } } }, { "if": { "properties": { "action": { "const": "check" } }, "required": ["action"] }, "then": { "not": { "anyOf": [{ "required": ["text"] }, { "required": ["value"] }, { "required": ["direction"] }, { "required": ["amount"] }, { "required": ["key"] }, { "required": ["ms"] }, { "required": ["url"] }, { "required": ["reason"] }, { "required": ["evidence"] }] } } }, { "if": { "properties": { "action": { "const": "scroll" } }, "required": ["action"] }, "then": { "not": { "anyOf": [{ "required": ["target"] }, { "required": ["text"] }, { "required": ["value"] }, { "required": ["key"] }, { "required": ["ms"] }, { "required": ["url"] }, { "required": ["reason"] }, { "required": ["evidence"] }] } } }, { "if": { "properties": { "action": { "const": "hover" } }, "required": ["action"] }, "then": { "not": { "anyOf": [{ "required": ["text"] }, { "required": ["value"] }, { "required": ["direction"] }, { "required": ["amount"] }, { "required": ["key"] }, { "required": ["ms"] }, { "required": ["url"] }, { "required": ["reason"] }, { "required": ["evidence"] }] } } }, { "if": { "properties": { "action": { "const": "key" } }, "required": ["action"] }, "then": { "not": { "anyOf": [{ "required": ["text"] }, { "required": ["value"] }, { "required": ["direction"] }, { "required": ["amount"] }, { "required": ["ms"] }, { "required": ["url"] }, { "required": ["reason"] }, { "required": ["evidence"] }] } } }, { "if": { "properties": { "action": { "const": "wait" } }, "required": ["action"] }, "then": { "not": { "anyOf": [{ "required": ["target"] }, { "required": ["text"] }, { "required": ["value"] }, { "required": ["direction"] }, { "required": ["amount"] }, { "required": ["key"] }, { "required": ["url"] }, { "required": ["reason"] }, { "required": ["evidence"] }] } } }, { "if": { "properties": { "action": { "const": "navigate" } }, "required": ["action"] }, "then": { "not": { "anyOf": [{ "required": ["target"] }, { "required": ["text"] }, { "required": ["value"] }, { "required": ["direction"] }, { "required": ["amount"] }, { "required": ["key"] }, { "required": ["ms"] }, { "required": ["reason"] }, { "required": ["evidence"] }] } } }, { "if": { "properties": { "action": { "const": "ask_user" } }, "required": ["action"] }, "then": { "not": { "anyOf": [{ "required": ["target"] }, { "required": ["text"] }, { "required": ["value"] }, { "required": ["direction"] }, { "required": ["amount"] }, { "required": ["key"] }, { "required": ["ms"] }, { "required": ["url"] }, { "required": ["evidence"] }] } } }, { "if": { "properties": { "action": { "const": "done" } }, "required": ["action"] }, "then": { "not": { "anyOf": [{ "required": ["target"] }, { "required": ["text"] }, { "required": ["value"] }, { "required": ["direction"] }, { "required": ["amount"] }, { "required": ["key"] }, { "required": ["ms"] }, { "required": ["url"] }, { "required": ["reason"] }] } } }, { "if": { "properties": { "action": { "const": "fail" } }, "required": ["action"] }, "then": { "not": { "anyOf": [{ "required": ["target"] }, { "required": ["text"] }, { "required": ["value"] }, { "required": ["direction"] }, { "required": ["amount"] }, { "required": ["key"] }, { "required": ["ms"] }, { "required": ["url"] }, { "required": ["evidence"] }] } } }] };
var schema34 = { "type": "string", "enum": ["click", "type", "select", "check", "scroll", "hover", "key", "wait", "navigate", "ask_user", "done", "fail"] };
var func1 = Object.prototype.hasOwnProperty;
var func2 = require_ucs2length().default;
var pattern4 = new RegExp("^E[0-9]{1,6}$", "u");
function validate22(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate22.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  const _errs2 = errors;
  let valid1 = true;
  const _errs3 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing0;
    if (data.action === void 0 && (missing0 = "action")) {
      const err0 = {};
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        let data0 = data.action;
        if (!(data0 === "click" || data0 === "type" || data0 === "select" || data0 === "check" || data0 === "hover")) {
          const err1 = {};
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
      }
    }
  }
  var _valid0 = _errs3 === errors;
  errors = _errs2;
  if (vErrors !== null) {
    if (_errs2) {
      vErrors.length = _errs2;
    } else {
      vErrors = null;
    }
  }
  if (_valid0) {
    const _errs5 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.target === void 0) {
        const err2 = { instancePath, schemaPath: "#/allOf/0/then/required", keyword: "required", params: { missingProperty: "target" }, message: "must have required property 'target'" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    var _valid0 = _errs5 === errors;
    valid1 = _valid0;
  }
  if (!valid1) {
    const err3 = { instancePath, schemaPath: "#/allOf/0/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err3];
    } else {
      vErrors.push(err3);
    }
    errors++;
  }
  const _errs7 = errors;
  let valid3 = true;
  const _errs8 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing1;
    if (data.action === void 0 && (missing1 = "action")) {
      const err4 = {};
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("type" !== data.action) {
          const err5 = {};
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
      }
    }
  }
  var _valid1 = _errs8 === errors;
  errors = _errs7;
  if (vErrors !== null) {
    if (_errs7) {
      vErrors.length = _errs7;
    } else {
      vErrors = null;
    }
  }
  if (_valid1) {
    const _errs10 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.text === void 0) {
        const err6 = { instancePath, schemaPath: "#/allOf/1/then/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    var _valid1 = _errs10 === errors;
    valid3 = _valid1;
  }
  if (!valid3) {
    const err7 = { instancePath, schemaPath: "#/allOf/1/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  const _errs12 = errors;
  let valid5 = true;
  const _errs13 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing2;
    if (data.action === void 0 && (missing2 = "action")) {
      const err8 = {};
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("select" !== data.action) {
          const err9 = {};
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      }
    }
  }
  var _valid2 = _errs13 === errors;
  errors = _errs12;
  if (vErrors !== null) {
    if (_errs12) {
      vErrors.length = _errs12;
    } else {
      vErrors = null;
    }
  }
  if (_valid2) {
    const _errs15 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.value === void 0) {
        const err10 = { instancePath, schemaPath: "#/allOf/2/then/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    var _valid2 = _errs15 === errors;
    valid5 = _valid2;
  }
  if (!valid5) {
    const err11 = { instancePath, schemaPath: "#/allOf/2/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err11];
    } else {
      vErrors.push(err11);
    }
    errors++;
  }
  const _errs17 = errors;
  let valid7 = true;
  const _errs18 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing3;
    if (data.action === void 0 && (missing3 = "action")) {
      const err12 = {};
      if (vErrors === null) {
        vErrors = [err12];
      } else {
        vErrors.push(err12);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("scroll" !== data.action) {
          const err13 = {};
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      }
    }
  }
  var _valid3 = _errs18 === errors;
  errors = _errs17;
  if (vErrors !== null) {
    if (_errs17) {
      vErrors.length = _errs17;
    } else {
      vErrors = null;
    }
  }
  if (_valid3) {
    const _errs20 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.direction === void 0) {
        const err14 = { instancePath, schemaPath: "#/allOf/3/then/required", keyword: "required", params: { missingProperty: "direction" }, message: "must have required property 'direction'" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      if (data.amount === void 0) {
        const err15 = { instancePath, schemaPath: "#/allOf/3/then/required", keyword: "required", params: { missingProperty: "amount" }, message: "must have required property 'amount'" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    var _valid3 = _errs20 === errors;
    valid7 = _valid3;
  }
  if (!valid7) {
    const err16 = { instancePath, schemaPath: "#/allOf/3/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err16];
    } else {
      vErrors.push(err16);
    }
    errors++;
  }
  const _errs22 = errors;
  let valid9 = true;
  const _errs23 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing4;
    if (data.action === void 0 && (missing4 = "action")) {
      const err17 = {};
      if (vErrors === null) {
        vErrors = [err17];
      } else {
        vErrors.push(err17);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("key" !== data.action) {
          const err18 = {};
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
      }
    }
  }
  var _valid4 = _errs23 === errors;
  errors = _errs22;
  if (vErrors !== null) {
    if (_errs22) {
      vErrors.length = _errs22;
    } else {
      vErrors = null;
    }
  }
  if (_valid4) {
    const _errs25 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.key === void 0) {
        const err19 = { instancePath, schemaPath: "#/allOf/4/then/required", keyword: "required", params: { missingProperty: "key" }, message: "must have required property 'key'" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    var _valid4 = _errs25 === errors;
    valid9 = _valid4;
  }
  if (!valid9) {
    const err20 = { instancePath, schemaPath: "#/allOf/4/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err20];
    } else {
      vErrors.push(err20);
    }
    errors++;
  }
  const _errs27 = errors;
  let valid11 = true;
  const _errs28 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing5;
    if (data.action === void 0 && (missing5 = "action")) {
      const err21 = {};
      if (vErrors === null) {
        vErrors = [err21];
      } else {
        vErrors.push(err21);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("wait" !== data.action) {
          const err22 = {};
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
      }
    }
  }
  var _valid5 = _errs28 === errors;
  errors = _errs27;
  if (vErrors !== null) {
    if (_errs27) {
      vErrors.length = _errs27;
    } else {
      vErrors = null;
    }
  }
  if (_valid5) {
    const _errs30 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.ms === void 0) {
        const err23 = { instancePath, schemaPath: "#/allOf/5/then/required", keyword: "required", params: { missingProperty: "ms" }, message: "must have required property 'ms'" };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    var _valid5 = _errs30 === errors;
    valid11 = _valid5;
  }
  if (!valid11) {
    const err24 = { instancePath, schemaPath: "#/allOf/5/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err24];
    } else {
      vErrors.push(err24);
    }
    errors++;
  }
  const _errs32 = errors;
  let valid13 = true;
  const _errs33 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing6;
    if (data.action === void 0 && (missing6 = "action")) {
      const err25 = {};
      if (vErrors === null) {
        vErrors = [err25];
      } else {
        vErrors.push(err25);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("navigate" !== data.action) {
          const err26 = {};
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      }
    }
  }
  var _valid6 = _errs33 === errors;
  errors = _errs32;
  if (vErrors !== null) {
    if (_errs32) {
      vErrors.length = _errs32;
    } else {
      vErrors = null;
    }
  }
  if (_valid6) {
    const _errs35 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.url === void 0) {
        const err27 = { instancePath, schemaPath: "#/allOf/6/then/required", keyword: "required", params: { missingProperty: "url" }, message: "must have required property 'url'" };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
    }
    var _valid6 = _errs35 === errors;
    valid13 = _valid6;
  }
  if (!valid13) {
    const err28 = { instancePath, schemaPath: "#/allOf/6/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err28];
    } else {
      vErrors.push(err28);
    }
    errors++;
  }
  const _errs37 = errors;
  let valid15 = true;
  const _errs38 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing7;
    if (data.action === void 0 && (missing7 = "action")) {
      const err29 = {};
      if (vErrors === null) {
        vErrors = [err29];
      } else {
        vErrors.push(err29);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        let data7 = data.action;
        if (!(data7 === "ask_user" || data7 === "fail")) {
          const err30 = {};
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
      }
    }
  }
  var _valid7 = _errs38 === errors;
  errors = _errs37;
  if (vErrors !== null) {
    if (_errs37) {
      vErrors.length = _errs37;
    } else {
      vErrors = null;
    }
  }
  if (_valid7) {
    const _errs40 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.reason === void 0) {
        const err31 = { instancePath, schemaPath: "#/allOf/7/then/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
    var _valid7 = _errs40 === errors;
    valid15 = _valid7;
  }
  if (!valid15) {
    const err32 = { instancePath, schemaPath: "#/allOf/7/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err32];
    } else {
      vErrors.push(err32);
    }
    errors++;
  }
  const _errs42 = errors;
  let valid17 = true;
  const _errs43 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing8;
    if (data.action === void 0 && (missing8 = "action")) {
      const err33 = {};
      if (vErrors === null) {
        vErrors = [err33];
      } else {
        vErrors.push(err33);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("done" !== data.action) {
          const err34 = {};
          if (vErrors === null) {
            vErrors = [err34];
          } else {
            vErrors.push(err34);
          }
          errors++;
        }
      }
    }
  }
  var _valid8 = _errs43 === errors;
  errors = _errs42;
  if (vErrors !== null) {
    if (_errs42) {
      vErrors.length = _errs42;
    } else {
      vErrors = null;
    }
  }
  if (_valid8) {
    const _errs45 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.evidence === void 0) {
        const err35 = { instancePath, schemaPath: "#/allOf/8/then/required", keyword: "required", params: { missingProperty: "evidence" }, message: "must have required property 'evidence'" };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
    }
    var _valid8 = _errs45 === errors;
    valid17 = _valid8;
  }
  if (!valid17) {
    const err36 = { instancePath, schemaPath: "#/allOf/8/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err36];
    } else {
      vErrors.push(err36);
    }
    errors++;
  }
  const _errs47 = errors;
  let valid19 = true;
  const _errs48 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing9;
    if (data.action === void 0 && (missing9 = "action")) {
      const err37 = {};
      if (vErrors === null) {
        vErrors = [err37];
      } else {
        vErrors.push(err37);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("click" !== data.action) {
          const err38 = {};
          if (vErrors === null) {
            vErrors = [err38];
          } else {
            vErrors.push(err38);
          }
          errors++;
        }
      }
    }
  }
  var _valid9 = _errs48 === errors;
  errors = _errs47;
  if (vErrors !== null) {
    if (_errs47) {
      vErrors.length = _errs47;
    } else {
      vErrors = null;
    }
  }
  if (_valid9) {
    const _errs50 = errors;
    const _errs51 = errors;
    const _errs52 = errors;
    const _errs53 = errors;
    let valid22 = false;
    const _errs54 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing10;
      if (data.text === void 0 && (missing10 = "text")) {
        const err39 = {};
        if (vErrors === null) {
          vErrors = [err39];
        } else {
          vErrors.push(err39);
        }
        errors++;
      }
    }
    var _valid10 = _errs54 === errors;
    valid22 = valid22 || _valid10;
    const _errs55 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing11;
      if (data.value === void 0 && (missing11 = "value")) {
        const err40 = {};
        if (vErrors === null) {
          vErrors = [err40];
        } else {
          vErrors.push(err40);
        }
        errors++;
      }
    }
    var _valid10 = _errs55 === errors;
    valid22 = valid22 || _valid10;
    const _errs56 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing12;
      if (data.direction === void 0 && (missing12 = "direction")) {
        const err41 = {};
        if (vErrors === null) {
          vErrors = [err41];
        } else {
          vErrors.push(err41);
        }
        errors++;
      }
    }
    var _valid10 = _errs56 === errors;
    valid22 = valid22 || _valid10;
    const _errs57 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing13;
      if (data.amount === void 0 && (missing13 = "amount")) {
        const err42 = {};
        if (vErrors === null) {
          vErrors = [err42];
        } else {
          vErrors.push(err42);
        }
        errors++;
      }
    }
    var _valid10 = _errs57 === errors;
    valid22 = valid22 || _valid10;
    const _errs58 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing14;
      if (data.key === void 0 && (missing14 = "key")) {
        const err43 = {};
        if (vErrors === null) {
          vErrors = [err43];
        } else {
          vErrors.push(err43);
        }
        errors++;
      }
    }
    var _valid10 = _errs58 === errors;
    valid22 = valid22 || _valid10;
    const _errs59 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing15;
      if (data.ms === void 0 && (missing15 = "ms")) {
        const err44 = {};
        if (vErrors === null) {
          vErrors = [err44];
        } else {
          vErrors.push(err44);
        }
        errors++;
      }
    }
    var _valid10 = _errs59 === errors;
    valid22 = valid22 || _valid10;
    const _errs60 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing16;
      if (data.url === void 0 && (missing16 = "url")) {
        const err45 = {};
        if (vErrors === null) {
          vErrors = [err45];
        } else {
          vErrors.push(err45);
        }
        errors++;
      }
    }
    var _valid10 = _errs60 === errors;
    valid22 = valid22 || _valid10;
    const _errs61 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing17;
      if (data.reason === void 0 && (missing17 = "reason")) {
        const err46 = {};
        if (vErrors === null) {
          vErrors = [err46];
        } else {
          vErrors.push(err46);
        }
        errors++;
      }
    }
    var _valid10 = _errs61 === errors;
    valid22 = valid22 || _valid10;
    const _errs62 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing18;
      if (data.evidence === void 0 && (missing18 = "evidence")) {
        const err47 = {};
        if (vErrors === null) {
          vErrors = [err47];
        } else {
          vErrors.push(err47);
        }
        errors++;
      }
    }
    var _valid10 = _errs62 === errors;
    valid22 = valid22 || _valid10;
    if (!valid22) {
      const err48 = {};
      if (vErrors === null) {
        vErrors = [err48];
      } else {
        vErrors.push(err48);
      }
      errors++;
    } else {
      errors = _errs53;
      if (vErrors !== null) {
        if (_errs53) {
          vErrors.length = _errs53;
        } else {
          vErrors = null;
        }
      }
    }
    var valid21 = _errs52 === errors;
    if (valid21) {
      const err49 = { instancePath, schemaPath: "#/allOf/9/then/not", keyword: "not", params: {}, message: "must NOT be valid" };
      if (vErrors === null) {
        vErrors = [err49];
      } else {
        vErrors.push(err49);
      }
      errors++;
    } else {
      errors = _errs51;
      if (vErrors !== null) {
        if (_errs51) {
          vErrors.length = _errs51;
        } else {
          vErrors = null;
        }
      }
    }
    var _valid9 = _errs50 === errors;
    valid19 = _valid9;
  }
  if (!valid19) {
    const err50 = { instancePath, schemaPath: "#/allOf/9/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err50];
    } else {
      vErrors.push(err50);
    }
    errors++;
  }
  const _errs64 = errors;
  let valid23 = true;
  const _errs65 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing19;
    if (data.action === void 0 && (missing19 = "action")) {
      const err51 = {};
      if (vErrors === null) {
        vErrors = [err51];
      } else {
        vErrors.push(err51);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("type" !== data.action) {
          const err52 = {};
          if (vErrors === null) {
            vErrors = [err52];
          } else {
            vErrors.push(err52);
          }
          errors++;
        }
      }
    }
  }
  var _valid11 = _errs65 === errors;
  errors = _errs64;
  if (vErrors !== null) {
    if (_errs64) {
      vErrors.length = _errs64;
    } else {
      vErrors = null;
    }
  }
  if (_valid11) {
    const _errs67 = errors;
    const _errs68 = errors;
    const _errs69 = errors;
    const _errs70 = errors;
    let valid26 = false;
    const _errs71 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing20;
      if (data.value === void 0 && (missing20 = "value")) {
        const err53 = {};
        if (vErrors === null) {
          vErrors = [err53];
        } else {
          vErrors.push(err53);
        }
        errors++;
      }
    }
    var _valid12 = _errs71 === errors;
    valid26 = valid26 || _valid12;
    const _errs72 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing21;
      if (data.direction === void 0 && (missing21 = "direction")) {
        const err54 = {};
        if (vErrors === null) {
          vErrors = [err54];
        } else {
          vErrors.push(err54);
        }
        errors++;
      }
    }
    var _valid12 = _errs72 === errors;
    valid26 = valid26 || _valid12;
    const _errs73 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing22;
      if (data.amount === void 0 && (missing22 = "amount")) {
        const err55 = {};
        if (vErrors === null) {
          vErrors = [err55];
        } else {
          vErrors.push(err55);
        }
        errors++;
      }
    }
    var _valid12 = _errs73 === errors;
    valid26 = valid26 || _valid12;
    const _errs74 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing23;
      if (data.key === void 0 && (missing23 = "key")) {
        const err56 = {};
        if (vErrors === null) {
          vErrors = [err56];
        } else {
          vErrors.push(err56);
        }
        errors++;
      }
    }
    var _valid12 = _errs74 === errors;
    valid26 = valid26 || _valid12;
    const _errs75 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing24;
      if (data.ms === void 0 && (missing24 = "ms")) {
        const err57 = {};
        if (vErrors === null) {
          vErrors = [err57];
        } else {
          vErrors.push(err57);
        }
        errors++;
      }
    }
    var _valid12 = _errs75 === errors;
    valid26 = valid26 || _valid12;
    const _errs76 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing25;
      if (data.url === void 0 && (missing25 = "url")) {
        const err58 = {};
        if (vErrors === null) {
          vErrors = [err58];
        } else {
          vErrors.push(err58);
        }
        errors++;
      }
    }
    var _valid12 = _errs76 === errors;
    valid26 = valid26 || _valid12;
    const _errs77 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing26;
      if (data.reason === void 0 && (missing26 = "reason")) {
        const err59 = {};
        if (vErrors === null) {
          vErrors = [err59];
        } else {
          vErrors.push(err59);
        }
        errors++;
      }
    }
    var _valid12 = _errs77 === errors;
    valid26 = valid26 || _valid12;
    const _errs78 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing27;
      if (data.evidence === void 0 && (missing27 = "evidence")) {
        const err60 = {};
        if (vErrors === null) {
          vErrors = [err60];
        } else {
          vErrors.push(err60);
        }
        errors++;
      }
    }
    var _valid12 = _errs78 === errors;
    valid26 = valid26 || _valid12;
    if (!valid26) {
      const err61 = {};
      if (vErrors === null) {
        vErrors = [err61];
      } else {
        vErrors.push(err61);
      }
      errors++;
    } else {
      errors = _errs70;
      if (vErrors !== null) {
        if (_errs70) {
          vErrors.length = _errs70;
        } else {
          vErrors = null;
        }
      }
    }
    var valid25 = _errs69 === errors;
    if (valid25) {
      const err62 = { instancePath, schemaPath: "#/allOf/10/then/not", keyword: "not", params: {}, message: "must NOT be valid" };
      if (vErrors === null) {
        vErrors = [err62];
      } else {
        vErrors.push(err62);
      }
      errors++;
    } else {
      errors = _errs68;
      if (vErrors !== null) {
        if (_errs68) {
          vErrors.length = _errs68;
        } else {
          vErrors = null;
        }
      }
    }
    var _valid11 = _errs67 === errors;
    valid23 = _valid11;
  }
  if (!valid23) {
    const err63 = { instancePath, schemaPath: "#/allOf/10/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err63];
    } else {
      vErrors.push(err63);
    }
    errors++;
  }
  const _errs80 = errors;
  let valid27 = true;
  const _errs81 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing28;
    if (data.action === void 0 && (missing28 = "action")) {
      const err64 = {};
      if (vErrors === null) {
        vErrors = [err64];
      } else {
        vErrors.push(err64);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("select" !== data.action) {
          const err65 = {};
          if (vErrors === null) {
            vErrors = [err65];
          } else {
            vErrors.push(err65);
          }
          errors++;
        }
      }
    }
  }
  var _valid13 = _errs81 === errors;
  errors = _errs80;
  if (vErrors !== null) {
    if (_errs80) {
      vErrors.length = _errs80;
    } else {
      vErrors = null;
    }
  }
  if (_valid13) {
    const _errs83 = errors;
    const _errs84 = errors;
    const _errs85 = errors;
    const _errs86 = errors;
    let valid30 = false;
    const _errs87 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing29;
      if (data.text === void 0 && (missing29 = "text")) {
        const err66 = {};
        if (vErrors === null) {
          vErrors = [err66];
        } else {
          vErrors.push(err66);
        }
        errors++;
      }
    }
    var _valid14 = _errs87 === errors;
    valid30 = valid30 || _valid14;
    const _errs88 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing30;
      if (data.direction === void 0 && (missing30 = "direction")) {
        const err67 = {};
        if (vErrors === null) {
          vErrors = [err67];
        } else {
          vErrors.push(err67);
        }
        errors++;
      }
    }
    var _valid14 = _errs88 === errors;
    valid30 = valid30 || _valid14;
    const _errs89 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing31;
      if (data.amount === void 0 && (missing31 = "amount")) {
        const err68 = {};
        if (vErrors === null) {
          vErrors = [err68];
        } else {
          vErrors.push(err68);
        }
        errors++;
      }
    }
    var _valid14 = _errs89 === errors;
    valid30 = valid30 || _valid14;
    const _errs90 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing32;
      if (data.key === void 0 && (missing32 = "key")) {
        const err69 = {};
        if (vErrors === null) {
          vErrors = [err69];
        } else {
          vErrors.push(err69);
        }
        errors++;
      }
    }
    var _valid14 = _errs90 === errors;
    valid30 = valid30 || _valid14;
    const _errs91 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing33;
      if (data.ms === void 0 && (missing33 = "ms")) {
        const err70 = {};
        if (vErrors === null) {
          vErrors = [err70];
        } else {
          vErrors.push(err70);
        }
        errors++;
      }
    }
    var _valid14 = _errs91 === errors;
    valid30 = valid30 || _valid14;
    const _errs92 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing34;
      if (data.url === void 0 && (missing34 = "url")) {
        const err71 = {};
        if (vErrors === null) {
          vErrors = [err71];
        } else {
          vErrors.push(err71);
        }
        errors++;
      }
    }
    var _valid14 = _errs92 === errors;
    valid30 = valid30 || _valid14;
    const _errs93 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing35;
      if (data.reason === void 0 && (missing35 = "reason")) {
        const err72 = {};
        if (vErrors === null) {
          vErrors = [err72];
        } else {
          vErrors.push(err72);
        }
        errors++;
      }
    }
    var _valid14 = _errs93 === errors;
    valid30 = valid30 || _valid14;
    const _errs94 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing36;
      if (data.evidence === void 0 && (missing36 = "evidence")) {
        const err73 = {};
        if (vErrors === null) {
          vErrors = [err73];
        } else {
          vErrors.push(err73);
        }
        errors++;
      }
    }
    var _valid14 = _errs94 === errors;
    valid30 = valid30 || _valid14;
    if (!valid30) {
      const err74 = {};
      if (vErrors === null) {
        vErrors = [err74];
      } else {
        vErrors.push(err74);
      }
      errors++;
    } else {
      errors = _errs86;
      if (vErrors !== null) {
        if (_errs86) {
          vErrors.length = _errs86;
        } else {
          vErrors = null;
        }
      }
    }
    var valid29 = _errs85 === errors;
    if (valid29) {
      const err75 = { instancePath, schemaPath: "#/allOf/11/then/not", keyword: "not", params: {}, message: "must NOT be valid" };
      if (vErrors === null) {
        vErrors = [err75];
      } else {
        vErrors.push(err75);
      }
      errors++;
    } else {
      errors = _errs84;
      if (vErrors !== null) {
        if (_errs84) {
          vErrors.length = _errs84;
        } else {
          vErrors = null;
        }
      }
    }
    var _valid13 = _errs83 === errors;
    valid27 = _valid13;
  }
  if (!valid27) {
    const err76 = { instancePath, schemaPath: "#/allOf/11/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err76];
    } else {
      vErrors.push(err76);
    }
    errors++;
  }
  const _errs96 = errors;
  let valid31 = true;
  const _errs97 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing37;
    if (data.action === void 0 && (missing37 = "action")) {
      const err77 = {};
      if (vErrors === null) {
        vErrors = [err77];
      } else {
        vErrors.push(err77);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("check" !== data.action) {
          const err78 = {};
          if (vErrors === null) {
            vErrors = [err78];
          } else {
            vErrors.push(err78);
          }
          errors++;
        }
      }
    }
  }
  var _valid15 = _errs97 === errors;
  errors = _errs96;
  if (vErrors !== null) {
    if (_errs96) {
      vErrors.length = _errs96;
    } else {
      vErrors = null;
    }
  }
  if (_valid15) {
    const _errs99 = errors;
    const _errs100 = errors;
    const _errs101 = errors;
    const _errs102 = errors;
    let valid34 = false;
    const _errs103 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing38;
      if (data.text === void 0 && (missing38 = "text")) {
        const err79 = {};
        if (vErrors === null) {
          vErrors = [err79];
        } else {
          vErrors.push(err79);
        }
        errors++;
      }
    }
    var _valid16 = _errs103 === errors;
    valid34 = valid34 || _valid16;
    const _errs104 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing39;
      if (data.value === void 0 && (missing39 = "value")) {
        const err80 = {};
        if (vErrors === null) {
          vErrors = [err80];
        } else {
          vErrors.push(err80);
        }
        errors++;
      }
    }
    var _valid16 = _errs104 === errors;
    valid34 = valid34 || _valid16;
    const _errs105 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing40;
      if (data.direction === void 0 && (missing40 = "direction")) {
        const err81 = {};
        if (vErrors === null) {
          vErrors = [err81];
        } else {
          vErrors.push(err81);
        }
        errors++;
      }
    }
    var _valid16 = _errs105 === errors;
    valid34 = valid34 || _valid16;
    const _errs106 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing41;
      if (data.amount === void 0 && (missing41 = "amount")) {
        const err82 = {};
        if (vErrors === null) {
          vErrors = [err82];
        } else {
          vErrors.push(err82);
        }
        errors++;
      }
    }
    var _valid16 = _errs106 === errors;
    valid34 = valid34 || _valid16;
    const _errs107 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing42;
      if (data.key === void 0 && (missing42 = "key")) {
        const err83 = {};
        if (vErrors === null) {
          vErrors = [err83];
        } else {
          vErrors.push(err83);
        }
        errors++;
      }
    }
    var _valid16 = _errs107 === errors;
    valid34 = valid34 || _valid16;
    const _errs108 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing43;
      if (data.ms === void 0 && (missing43 = "ms")) {
        const err84 = {};
        if (vErrors === null) {
          vErrors = [err84];
        } else {
          vErrors.push(err84);
        }
        errors++;
      }
    }
    var _valid16 = _errs108 === errors;
    valid34 = valid34 || _valid16;
    const _errs109 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing44;
      if (data.url === void 0 && (missing44 = "url")) {
        const err85 = {};
        if (vErrors === null) {
          vErrors = [err85];
        } else {
          vErrors.push(err85);
        }
        errors++;
      }
    }
    var _valid16 = _errs109 === errors;
    valid34 = valid34 || _valid16;
    const _errs110 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing45;
      if (data.reason === void 0 && (missing45 = "reason")) {
        const err86 = {};
        if (vErrors === null) {
          vErrors = [err86];
        } else {
          vErrors.push(err86);
        }
        errors++;
      }
    }
    var _valid16 = _errs110 === errors;
    valid34 = valid34 || _valid16;
    const _errs111 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing46;
      if (data.evidence === void 0 && (missing46 = "evidence")) {
        const err87 = {};
        if (vErrors === null) {
          vErrors = [err87];
        } else {
          vErrors.push(err87);
        }
        errors++;
      }
    }
    var _valid16 = _errs111 === errors;
    valid34 = valid34 || _valid16;
    if (!valid34) {
      const err88 = {};
      if (vErrors === null) {
        vErrors = [err88];
      } else {
        vErrors.push(err88);
      }
      errors++;
    } else {
      errors = _errs102;
      if (vErrors !== null) {
        if (_errs102) {
          vErrors.length = _errs102;
        } else {
          vErrors = null;
        }
      }
    }
    var valid33 = _errs101 === errors;
    if (valid33) {
      const err89 = { instancePath, schemaPath: "#/allOf/12/then/not", keyword: "not", params: {}, message: "must NOT be valid" };
      if (vErrors === null) {
        vErrors = [err89];
      } else {
        vErrors.push(err89);
      }
      errors++;
    } else {
      errors = _errs100;
      if (vErrors !== null) {
        if (_errs100) {
          vErrors.length = _errs100;
        } else {
          vErrors = null;
        }
      }
    }
    var _valid15 = _errs99 === errors;
    valid31 = _valid15;
  }
  if (!valid31) {
    const err90 = { instancePath, schemaPath: "#/allOf/12/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err90];
    } else {
      vErrors.push(err90);
    }
    errors++;
  }
  const _errs113 = errors;
  let valid35 = true;
  const _errs114 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing47;
    if (data.action === void 0 && (missing47 = "action")) {
      const err91 = {};
      if (vErrors === null) {
        vErrors = [err91];
      } else {
        vErrors.push(err91);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("scroll" !== data.action) {
          const err92 = {};
          if (vErrors === null) {
            vErrors = [err92];
          } else {
            vErrors.push(err92);
          }
          errors++;
        }
      }
    }
  }
  var _valid17 = _errs114 === errors;
  errors = _errs113;
  if (vErrors !== null) {
    if (_errs113) {
      vErrors.length = _errs113;
    } else {
      vErrors = null;
    }
  }
  if (_valid17) {
    const _errs116 = errors;
    const _errs117 = errors;
    const _errs118 = errors;
    const _errs119 = errors;
    let valid38 = false;
    const _errs120 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing48;
      if (data.target === void 0 && (missing48 = "target")) {
        const err93 = {};
        if (vErrors === null) {
          vErrors = [err93];
        } else {
          vErrors.push(err93);
        }
        errors++;
      }
    }
    var _valid18 = _errs120 === errors;
    valid38 = valid38 || _valid18;
    const _errs121 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing49;
      if (data.text === void 0 && (missing49 = "text")) {
        const err94 = {};
        if (vErrors === null) {
          vErrors = [err94];
        } else {
          vErrors.push(err94);
        }
        errors++;
      }
    }
    var _valid18 = _errs121 === errors;
    valid38 = valid38 || _valid18;
    const _errs122 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing50;
      if (data.value === void 0 && (missing50 = "value")) {
        const err95 = {};
        if (vErrors === null) {
          vErrors = [err95];
        } else {
          vErrors.push(err95);
        }
        errors++;
      }
    }
    var _valid18 = _errs122 === errors;
    valid38 = valid38 || _valid18;
    const _errs123 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing51;
      if (data.key === void 0 && (missing51 = "key")) {
        const err96 = {};
        if (vErrors === null) {
          vErrors = [err96];
        } else {
          vErrors.push(err96);
        }
        errors++;
      }
    }
    var _valid18 = _errs123 === errors;
    valid38 = valid38 || _valid18;
    const _errs124 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing52;
      if (data.ms === void 0 && (missing52 = "ms")) {
        const err97 = {};
        if (vErrors === null) {
          vErrors = [err97];
        } else {
          vErrors.push(err97);
        }
        errors++;
      }
    }
    var _valid18 = _errs124 === errors;
    valid38 = valid38 || _valid18;
    const _errs125 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing53;
      if (data.url === void 0 && (missing53 = "url")) {
        const err98 = {};
        if (vErrors === null) {
          vErrors = [err98];
        } else {
          vErrors.push(err98);
        }
        errors++;
      }
    }
    var _valid18 = _errs125 === errors;
    valid38 = valid38 || _valid18;
    const _errs126 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing54;
      if (data.reason === void 0 && (missing54 = "reason")) {
        const err99 = {};
        if (vErrors === null) {
          vErrors = [err99];
        } else {
          vErrors.push(err99);
        }
        errors++;
      }
    }
    var _valid18 = _errs126 === errors;
    valid38 = valid38 || _valid18;
    const _errs127 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing55;
      if (data.evidence === void 0 && (missing55 = "evidence")) {
        const err100 = {};
        if (vErrors === null) {
          vErrors = [err100];
        } else {
          vErrors.push(err100);
        }
        errors++;
      }
    }
    var _valid18 = _errs127 === errors;
    valid38 = valid38 || _valid18;
    if (!valid38) {
      const err101 = {};
      if (vErrors === null) {
        vErrors = [err101];
      } else {
        vErrors.push(err101);
      }
      errors++;
    } else {
      errors = _errs119;
      if (vErrors !== null) {
        if (_errs119) {
          vErrors.length = _errs119;
        } else {
          vErrors = null;
        }
      }
    }
    var valid37 = _errs118 === errors;
    if (valid37) {
      const err102 = { instancePath, schemaPath: "#/allOf/13/then/not", keyword: "not", params: {}, message: "must NOT be valid" };
      if (vErrors === null) {
        vErrors = [err102];
      } else {
        vErrors.push(err102);
      }
      errors++;
    } else {
      errors = _errs117;
      if (vErrors !== null) {
        if (_errs117) {
          vErrors.length = _errs117;
        } else {
          vErrors = null;
        }
      }
    }
    var _valid17 = _errs116 === errors;
    valid35 = _valid17;
  }
  if (!valid35) {
    const err103 = { instancePath, schemaPath: "#/allOf/13/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err103];
    } else {
      vErrors.push(err103);
    }
    errors++;
  }
  const _errs129 = errors;
  let valid39 = true;
  const _errs130 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing56;
    if (data.action === void 0 && (missing56 = "action")) {
      const err104 = {};
      if (vErrors === null) {
        vErrors = [err104];
      } else {
        vErrors.push(err104);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("hover" !== data.action) {
          const err105 = {};
          if (vErrors === null) {
            vErrors = [err105];
          } else {
            vErrors.push(err105);
          }
          errors++;
        }
      }
    }
  }
  var _valid19 = _errs130 === errors;
  errors = _errs129;
  if (vErrors !== null) {
    if (_errs129) {
      vErrors.length = _errs129;
    } else {
      vErrors = null;
    }
  }
  if (_valid19) {
    const _errs132 = errors;
    const _errs133 = errors;
    const _errs134 = errors;
    const _errs135 = errors;
    let valid42 = false;
    const _errs136 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing57;
      if (data.text === void 0 && (missing57 = "text")) {
        const err106 = {};
        if (vErrors === null) {
          vErrors = [err106];
        } else {
          vErrors.push(err106);
        }
        errors++;
      }
    }
    var _valid20 = _errs136 === errors;
    valid42 = valid42 || _valid20;
    const _errs137 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing58;
      if (data.value === void 0 && (missing58 = "value")) {
        const err107 = {};
        if (vErrors === null) {
          vErrors = [err107];
        } else {
          vErrors.push(err107);
        }
        errors++;
      }
    }
    var _valid20 = _errs137 === errors;
    valid42 = valid42 || _valid20;
    const _errs138 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing59;
      if (data.direction === void 0 && (missing59 = "direction")) {
        const err108 = {};
        if (vErrors === null) {
          vErrors = [err108];
        } else {
          vErrors.push(err108);
        }
        errors++;
      }
    }
    var _valid20 = _errs138 === errors;
    valid42 = valid42 || _valid20;
    const _errs139 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing60;
      if (data.amount === void 0 && (missing60 = "amount")) {
        const err109 = {};
        if (vErrors === null) {
          vErrors = [err109];
        } else {
          vErrors.push(err109);
        }
        errors++;
      }
    }
    var _valid20 = _errs139 === errors;
    valid42 = valid42 || _valid20;
    const _errs140 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing61;
      if (data.key === void 0 && (missing61 = "key")) {
        const err110 = {};
        if (vErrors === null) {
          vErrors = [err110];
        } else {
          vErrors.push(err110);
        }
        errors++;
      }
    }
    var _valid20 = _errs140 === errors;
    valid42 = valid42 || _valid20;
    const _errs141 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing62;
      if (data.ms === void 0 && (missing62 = "ms")) {
        const err111 = {};
        if (vErrors === null) {
          vErrors = [err111];
        } else {
          vErrors.push(err111);
        }
        errors++;
      }
    }
    var _valid20 = _errs141 === errors;
    valid42 = valid42 || _valid20;
    const _errs142 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing63;
      if (data.url === void 0 && (missing63 = "url")) {
        const err112 = {};
        if (vErrors === null) {
          vErrors = [err112];
        } else {
          vErrors.push(err112);
        }
        errors++;
      }
    }
    var _valid20 = _errs142 === errors;
    valid42 = valid42 || _valid20;
    const _errs143 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing64;
      if (data.reason === void 0 && (missing64 = "reason")) {
        const err113 = {};
        if (vErrors === null) {
          vErrors = [err113];
        } else {
          vErrors.push(err113);
        }
        errors++;
      }
    }
    var _valid20 = _errs143 === errors;
    valid42 = valid42 || _valid20;
    const _errs144 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing65;
      if (data.evidence === void 0 && (missing65 = "evidence")) {
        const err114 = {};
        if (vErrors === null) {
          vErrors = [err114];
        } else {
          vErrors.push(err114);
        }
        errors++;
      }
    }
    var _valid20 = _errs144 === errors;
    valid42 = valid42 || _valid20;
    if (!valid42) {
      const err115 = {};
      if (vErrors === null) {
        vErrors = [err115];
      } else {
        vErrors.push(err115);
      }
      errors++;
    } else {
      errors = _errs135;
      if (vErrors !== null) {
        if (_errs135) {
          vErrors.length = _errs135;
        } else {
          vErrors = null;
        }
      }
    }
    var valid41 = _errs134 === errors;
    if (valid41) {
      const err116 = { instancePath, schemaPath: "#/allOf/14/then/not", keyword: "not", params: {}, message: "must NOT be valid" };
      if (vErrors === null) {
        vErrors = [err116];
      } else {
        vErrors.push(err116);
      }
      errors++;
    } else {
      errors = _errs133;
      if (vErrors !== null) {
        if (_errs133) {
          vErrors.length = _errs133;
        } else {
          vErrors = null;
        }
      }
    }
    var _valid19 = _errs132 === errors;
    valid39 = _valid19;
  }
  if (!valid39) {
    const err117 = { instancePath, schemaPath: "#/allOf/14/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err117];
    } else {
      vErrors.push(err117);
    }
    errors++;
  }
  const _errs146 = errors;
  let valid43 = true;
  const _errs147 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing66;
    if (data.action === void 0 && (missing66 = "action")) {
      const err118 = {};
      if (vErrors === null) {
        vErrors = [err118];
      } else {
        vErrors.push(err118);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("key" !== data.action) {
          const err119 = {};
          if (vErrors === null) {
            vErrors = [err119];
          } else {
            vErrors.push(err119);
          }
          errors++;
        }
      }
    }
  }
  var _valid21 = _errs147 === errors;
  errors = _errs146;
  if (vErrors !== null) {
    if (_errs146) {
      vErrors.length = _errs146;
    } else {
      vErrors = null;
    }
  }
  if (_valid21) {
    const _errs149 = errors;
    const _errs150 = errors;
    const _errs151 = errors;
    const _errs152 = errors;
    let valid46 = false;
    const _errs153 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing67;
      if (data.text === void 0 && (missing67 = "text")) {
        const err120 = {};
        if (vErrors === null) {
          vErrors = [err120];
        } else {
          vErrors.push(err120);
        }
        errors++;
      }
    }
    var _valid22 = _errs153 === errors;
    valid46 = valid46 || _valid22;
    const _errs154 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing68;
      if (data.value === void 0 && (missing68 = "value")) {
        const err121 = {};
        if (vErrors === null) {
          vErrors = [err121];
        } else {
          vErrors.push(err121);
        }
        errors++;
      }
    }
    var _valid22 = _errs154 === errors;
    valid46 = valid46 || _valid22;
    const _errs155 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing69;
      if (data.direction === void 0 && (missing69 = "direction")) {
        const err122 = {};
        if (vErrors === null) {
          vErrors = [err122];
        } else {
          vErrors.push(err122);
        }
        errors++;
      }
    }
    var _valid22 = _errs155 === errors;
    valid46 = valid46 || _valid22;
    const _errs156 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing70;
      if (data.amount === void 0 && (missing70 = "amount")) {
        const err123 = {};
        if (vErrors === null) {
          vErrors = [err123];
        } else {
          vErrors.push(err123);
        }
        errors++;
      }
    }
    var _valid22 = _errs156 === errors;
    valid46 = valid46 || _valid22;
    const _errs157 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing71;
      if (data.ms === void 0 && (missing71 = "ms")) {
        const err124 = {};
        if (vErrors === null) {
          vErrors = [err124];
        } else {
          vErrors.push(err124);
        }
        errors++;
      }
    }
    var _valid22 = _errs157 === errors;
    valid46 = valid46 || _valid22;
    const _errs158 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing72;
      if (data.url === void 0 && (missing72 = "url")) {
        const err125 = {};
        if (vErrors === null) {
          vErrors = [err125];
        } else {
          vErrors.push(err125);
        }
        errors++;
      }
    }
    var _valid22 = _errs158 === errors;
    valid46 = valid46 || _valid22;
    const _errs159 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing73;
      if (data.reason === void 0 && (missing73 = "reason")) {
        const err126 = {};
        if (vErrors === null) {
          vErrors = [err126];
        } else {
          vErrors.push(err126);
        }
        errors++;
      }
    }
    var _valid22 = _errs159 === errors;
    valid46 = valid46 || _valid22;
    const _errs160 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing74;
      if (data.evidence === void 0 && (missing74 = "evidence")) {
        const err127 = {};
        if (vErrors === null) {
          vErrors = [err127];
        } else {
          vErrors.push(err127);
        }
        errors++;
      }
    }
    var _valid22 = _errs160 === errors;
    valid46 = valid46 || _valid22;
    if (!valid46) {
      const err128 = {};
      if (vErrors === null) {
        vErrors = [err128];
      } else {
        vErrors.push(err128);
      }
      errors++;
    } else {
      errors = _errs152;
      if (vErrors !== null) {
        if (_errs152) {
          vErrors.length = _errs152;
        } else {
          vErrors = null;
        }
      }
    }
    var valid45 = _errs151 === errors;
    if (valid45) {
      const err129 = { instancePath, schemaPath: "#/allOf/15/then/not", keyword: "not", params: {}, message: "must NOT be valid" };
      if (vErrors === null) {
        vErrors = [err129];
      } else {
        vErrors.push(err129);
      }
      errors++;
    } else {
      errors = _errs150;
      if (vErrors !== null) {
        if (_errs150) {
          vErrors.length = _errs150;
        } else {
          vErrors = null;
        }
      }
    }
    var _valid21 = _errs149 === errors;
    valid43 = _valid21;
  }
  if (!valid43) {
    const err130 = { instancePath, schemaPath: "#/allOf/15/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err130];
    } else {
      vErrors.push(err130);
    }
    errors++;
  }
  const _errs162 = errors;
  let valid47 = true;
  const _errs163 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing75;
    if (data.action === void 0 && (missing75 = "action")) {
      const err131 = {};
      if (vErrors === null) {
        vErrors = [err131];
      } else {
        vErrors.push(err131);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("wait" !== data.action) {
          const err132 = {};
          if (vErrors === null) {
            vErrors = [err132];
          } else {
            vErrors.push(err132);
          }
          errors++;
        }
      }
    }
  }
  var _valid23 = _errs163 === errors;
  errors = _errs162;
  if (vErrors !== null) {
    if (_errs162) {
      vErrors.length = _errs162;
    } else {
      vErrors = null;
    }
  }
  if (_valid23) {
    const _errs165 = errors;
    const _errs166 = errors;
    const _errs167 = errors;
    const _errs168 = errors;
    let valid50 = false;
    const _errs169 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing76;
      if (data.target === void 0 && (missing76 = "target")) {
        const err133 = {};
        if (vErrors === null) {
          vErrors = [err133];
        } else {
          vErrors.push(err133);
        }
        errors++;
      }
    }
    var _valid24 = _errs169 === errors;
    valid50 = valid50 || _valid24;
    const _errs170 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing77;
      if (data.text === void 0 && (missing77 = "text")) {
        const err134 = {};
        if (vErrors === null) {
          vErrors = [err134];
        } else {
          vErrors.push(err134);
        }
        errors++;
      }
    }
    var _valid24 = _errs170 === errors;
    valid50 = valid50 || _valid24;
    const _errs171 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing78;
      if (data.value === void 0 && (missing78 = "value")) {
        const err135 = {};
        if (vErrors === null) {
          vErrors = [err135];
        } else {
          vErrors.push(err135);
        }
        errors++;
      }
    }
    var _valid24 = _errs171 === errors;
    valid50 = valid50 || _valid24;
    const _errs172 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing79;
      if (data.direction === void 0 && (missing79 = "direction")) {
        const err136 = {};
        if (vErrors === null) {
          vErrors = [err136];
        } else {
          vErrors.push(err136);
        }
        errors++;
      }
    }
    var _valid24 = _errs172 === errors;
    valid50 = valid50 || _valid24;
    const _errs173 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing80;
      if (data.amount === void 0 && (missing80 = "amount")) {
        const err137 = {};
        if (vErrors === null) {
          vErrors = [err137];
        } else {
          vErrors.push(err137);
        }
        errors++;
      }
    }
    var _valid24 = _errs173 === errors;
    valid50 = valid50 || _valid24;
    const _errs174 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing81;
      if (data.key === void 0 && (missing81 = "key")) {
        const err138 = {};
        if (vErrors === null) {
          vErrors = [err138];
        } else {
          vErrors.push(err138);
        }
        errors++;
      }
    }
    var _valid24 = _errs174 === errors;
    valid50 = valid50 || _valid24;
    const _errs175 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing82;
      if (data.url === void 0 && (missing82 = "url")) {
        const err139 = {};
        if (vErrors === null) {
          vErrors = [err139];
        } else {
          vErrors.push(err139);
        }
        errors++;
      }
    }
    var _valid24 = _errs175 === errors;
    valid50 = valid50 || _valid24;
    const _errs176 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing83;
      if (data.reason === void 0 && (missing83 = "reason")) {
        const err140 = {};
        if (vErrors === null) {
          vErrors = [err140];
        } else {
          vErrors.push(err140);
        }
        errors++;
      }
    }
    var _valid24 = _errs176 === errors;
    valid50 = valid50 || _valid24;
    const _errs177 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing84;
      if (data.evidence === void 0 && (missing84 = "evidence")) {
        const err141 = {};
        if (vErrors === null) {
          vErrors = [err141];
        } else {
          vErrors.push(err141);
        }
        errors++;
      }
    }
    var _valid24 = _errs177 === errors;
    valid50 = valid50 || _valid24;
    if (!valid50) {
      const err142 = {};
      if (vErrors === null) {
        vErrors = [err142];
      } else {
        vErrors.push(err142);
      }
      errors++;
    } else {
      errors = _errs168;
      if (vErrors !== null) {
        if (_errs168) {
          vErrors.length = _errs168;
        } else {
          vErrors = null;
        }
      }
    }
    var valid49 = _errs167 === errors;
    if (valid49) {
      const err143 = { instancePath, schemaPath: "#/allOf/16/then/not", keyword: "not", params: {}, message: "must NOT be valid" };
      if (vErrors === null) {
        vErrors = [err143];
      } else {
        vErrors.push(err143);
      }
      errors++;
    } else {
      errors = _errs166;
      if (vErrors !== null) {
        if (_errs166) {
          vErrors.length = _errs166;
        } else {
          vErrors = null;
        }
      }
    }
    var _valid23 = _errs165 === errors;
    valid47 = _valid23;
  }
  if (!valid47) {
    const err144 = { instancePath, schemaPath: "#/allOf/16/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err144];
    } else {
      vErrors.push(err144);
    }
    errors++;
  }
  const _errs179 = errors;
  let valid51 = true;
  const _errs180 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing85;
    if (data.action === void 0 && (missing85 = "action")) {
      const err145 = {};
      if (vErrors === null) {
        vErrors = [err145];
      } else {
        vErrors.push(err145);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("navigate" !== data.action) {
          const err146 = {};
          if (vErrors === null) {
            vErrors = [err146];
          } else {
            vErrors.push(err146);
          }
          errors++;
        }
      }
    }
  }
  var _valid25 = _errs180 === errors;
  errors = _errs179;
  if (vErrors !== null) {
    if (_errs179) {
      vErrors.length = _errs179;
    } else {
      vErrors = null;
    }
  }
  if (_valid25) {
    const _errs182 = errors;
    const _errs183 = errors;
    const _errs184 = errors;
    const _errs185 = errors;
    let valid54 = false;
    const _errs186 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing86;
      if (data.target === void 0 && (missing86 = "target")) {
        const err147 = {};
        if (vErrors === null) {
          vErrors = [err147];
        } else {
          vErrors.push(err147);
        }
        errors++;
      }
    }
    var _valid26 = _errs186 === errors;
    valid54 = valid54 || _valid26;
    const _errs187 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing87;
      if (data.text === void 0 && (missing87 = "text")) {
        const err148 = {};
        if (vErrors === null) {
          vErrors = [err148];
        } else {
          vErrors.push(err148);
        }
        errors++;
      }
    }
    var _valid26 = _errs187 === errors;
    valid54 = valid54 || _valid26;
    const _errs188 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing88;
      if (data.value === void 0 && (missing88 = "value")) {
        const err149 = {};
        if (vErrors === null) {
          vErrors = [err149];
        } else {
          vErrors.push(err149);
        }
        errors++;
      }
    }
    var _valid26 = _errs188 === errors;
    valid54 = valid54 || _valid26;
    const _errs189 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing89;
      if (data.direction === void 0 && (missing89 = "direction")) {
        const err150 = {};
        if (vErrors === null) {
          vErrors = [err150];
        } else {
          vErrors.push(err150);
        }
        errors++;
      }
    }
    var _valid26 = _errs189 === errors;
    valid54 = valid54 || _valid26;
    const _errs190 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing90;
      if (data.amount === void 0 && (missing90 = "amount")) {
        const err151 = {};
        if (vErrors === null) {
          vErrors = [err151];
        } else {
          vErrors.push(err151);
        }
        errors++;
      }
    }
    var _valid26 = _errs190 === errors;
    valid54 = valid54 || _valid26;
    const _errs191 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing91;
      if (data.key === void 0 && (missing91 = "key")) {
        const err152 = {};
        if (vErrors === null) {
          vErrors = [err152];
        } else {
          vErrors.push(err152);
        }
        errors++;
      }
    }
    var _valid26 = _errs191 === errors;
    valid54 = valid54 || _valid26;
    const _errs192 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing92;
      if (data.ms === void 0 && (missing92 = "ms")) {
        const err153 = {};
        if (vErrors === null) {
          vErrors = [err153];
        } else {
          vErrors.push(err153);
        }
        errors++;
      }
    }
    var _valid26 = _errs192 === errors;
    valid54 = valid54 || _valid26;
    const _errs193 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing93;
      if (data.reason === void 0 && (missing93 = "reason")) {
        const err154 = {};
        if (vErrors === null) {
          vErrors = [err154];
        } else {
          vErrors.push(err154);
        }
        errors++;
      }
    }
    var _valid26 = _errs193 === errors;
    valid54 = valid54 || _valid26;
    const _errs194 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing94;
      if (data.evidence === void 0 && (missing94 = "evidence")) {
        const err155 = {};
        if (vErrors === null) {
          vErrors = [err155];
        } else {
          vErrors.push(err155);
        }
        errors++;
      }
    }
    var _valid26 = _errs194 === errors;
    valid54 = valid54 || _valid26;
    if (!valid54) {
      const err156 = {};
      if (vErrors === null) {
        vErrors = [err156];
      } else {
        vErrors.push(err156);
      }
      errors++;
    } else {
      errors = _errs185;
      if (vErrors !== null) {
        if (_errs185) {
          vErrors.length = _errs185;
        } else {
          vErrors = null;
        }
      }
    }
    var valid53 = _errs184 === errors;
    if (valid53) {
      const err157 = { instancePath, schemaPath: "#/allOf/17/then/not", keyword: "not", params: {}, message: "must NOT be valid" };
      if (vErrors === null) {
        vErrors = [err157];
      } else {
        vErrors.push(err157);
      }
      errors++;
    } else {
      errors = _errs183;
      if (vErrors !== null) {
        if (_errs183) {
          vErrors.length = _errs183;
        } else {
          vErrors = null;
        }
      }
    }
    var _valid25 = _errs182 === errors;
    valid51 = _valid25;
  }
  if (!valid51) {
    const err158 = { instancePath, schemaPath: "#/allOf/17/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err158];
    } else {
      vErrors.push(err158);
    }
    errors++;
  }
  const _errs196 = errors;
  let valid55 = true;
  const _errs197 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing95;
    if (data.action === void 0 && (missing95 = "action")) {
      const err159 = {};
      if (vErrors === null) {
        vErrors = [err159];
      } else {
        vErrors.push(err159);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("ask_user" !== data.action) {
          const err160 = {};
          if (vErrors === null) {
            vErrors = [err160];
          } else {
            vErrors.push(err160);
          }
          errors++;
        }
      }
    }
  }
  var _valid27 = _errs197 === errors;
  errors = _errs196;
  if (vErrors !== null) {
    if (_errs196) {
      vErrors.length = _errs196;
    } else {
      vErrors = null;
    }
  }
  if (_valid27) {
    const _errs199 = errors;
    const _errs200 = errors;
    const _errs201 = errors;
    const _errs202 = errors;
    let valid58 = false;
    const _errs203 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing96;
      if (data.target === void 0 && (missing96 = "target")) {
        const err161 = {};
        if (vErrors === null) {
          vErrors = [err161];
        } else {
          vErrors.push(err161);
        }
        errors++;
      }
    }
    var _valid28 = _errs203 === errors;
    valid58 = valid58 || _valid28;
    const _errs204 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing97;
      if (data.text === void 0 && (missing97 = "text")) {
        const err162 = {};
        if (vErrors === null) {
          vErrors = [err162];
        } else {
          vErrors.push(err162);
        }
        errors++;
      }
    }
    var _valid28 = _errs204 === errors;
    valid58 = valid58 || _valid28;
    const _errs205 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing98;
      if (data.value === void 0 && (missing98 = "value")) {
        const err163 = {};
        if (vErrors === null) {
          vErrors = [err163];
        } else {
          vErrors.push(err163);
        }
        errors++;
      }
    }
    var _valid28 = _errs205 === errors;
    valid58 = valid58 || _valid28;
    const _errs206 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing99;
      if (data.direction === void 0 && (missing99 = "direction")) {
        const err164 = {};
        if (vErrors === null) {
          vErrors = [err164];
        } else {
          vErrors.push(err164);
        }
        errors++;
      }
    }
    var _valid28 = _errs206 === errors;
    valid58 = valid58 || _valid28;
    const _errs207 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing100;
      if (data.amount === void 0 && (missing100 = "amount")) {
        const err165 = {};
        if (vErrors === null) {
          vErrors = [err165];
        } else {
          vErrors.push(err165);
        }
        errors++;
      }
    }
    var _valid28 = _errs207 === errors;
    valid58 = valid58 || _valid28;
    const _errs208 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing101;
      if (data.key === void 0 && (missing101 = "key")) {
        const err166 = {};
        if (vErrors === null) {
          vErrors = [err166];
        } else {
          vErrors.push(err166);
        }
        errors++;
      }
    }
    var _valid28 = _errs208 === errors;
    valid58 = valid58 || _valid28;
    const _errs209 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing102;
      if (data.ms === void 0 && (missing102 = "ms")) {
        const err167 = {};
        if (vErrors === null) {
          vErrors = [err167];
        } else {
          vErrors.push(err167);
        }
        errors++;
      }
    }
    var _valid28 = _errs209 === errors;
    valid58 = valid58 || _valid28;
    const _errs210 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing103;
      if (data.url === void 0 && (missing103 = "url")) {
        const err168 = {};
        if (vErrors === null) {
          vErrors = [err168];
        } else {
          vErrors.push(err168);
        }
        errors++;
      }
    }
    var _valid28 = _errs210 === errors;
    valid58 = valid58 || _valid28;
    const _errs211 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing104;
      if (data.evidence === void 0 && (missing104 = "evidence")) {
        const err169 = {};
        if (vErrors === null) {
          vErrors = [err169];
        } else {
          vErrors.push(err169);
        }
        errors++;
      }
    }
    var _valid28 = _errs211 === errors;
    valid58 = valid58 || _valid28;
    if (!valid58) {
      const err170 = {};
      if (vErrors === null) {
        vErrors = [err170];
      } else {
        vErrors.push(err170);
      }
      errors++;
    } else {
      errors = _errs202;
      if (vErrors !== null) {
        if (_errs202) {
          vErrors.length = _errs202;
        } else {
          vErrors = null;
        }
      }
    }
    var valid57 = _errs201 === errors;
    if (valid57) {
      const err171 = { instancePath, schemaPath: "#/allOf/18/then/not", keyword: "not", params: {}, message: "must NOT be valid" };
      if (vErrors === null) {
        vErrors = [err171];
      } else {
        vErrors.push(err171);
      }
      errors++;
    } else {
      errors = _errs200;
      if (vErrors !== null) {
        if (_errs200) {
          vErrors.length = _errs200;
        } else {
          vErrors = null;
        }
      }
    }
    var _valid27 = _errs199 === errors;
    valid55 = _valid27;
  }
  if (!valid55) {
    const err172 = { instancePath, schemaPath: "#/allOf/18/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err172];
    } else {
      vErrors.push(err172);
    }
    errors++;
  }
  const _errs213 = errors;
  let valid59 = true;
  const _errs214 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing105;
    if (data.action === void 0 && (missing105 = "action")) {
      const err173 = {};
      if (vErrors === null) {
        vErrors = [err173];
      } else {
        vErrors.push(err173);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("done" !== data.action) {
          const err174 = {};
          if (vErrors === null) {
            vErrors = [err174];
          } else {
            vErrors.push(err174);
          }
          errors++;
        }
      }
    }
  }
  var _valid29 = _errs214 === errors;
  errors = _errs213;
  if (vErrors !== null) {
    if (_errs213) {
      vErrors.length = _errs213;
    } else {
      vErrors = null;
    }
  }
  if (_valid29) {
    const _errs216 = errors;
    const _errs217 = errors;
    const _errs218 = errors;
    const _errs219 = errors;
    let valid62 = false;
    const _errs220 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing106;
      if (data.target === void 0 && (missing106 = "target")) {
        const err175 = {};
        if (vErrors === null) {
          vErrors = [err175];
        } else {
          vErrors.push(err175);
        }
        errors++;
      }
    }
    var _valid30 = _errs220 === errors;
    valid62 = valid62 || _valid30;
    const _errs221 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing107;
      if (data.text === void 0 && (missing107 = "text")) {
        const err176 = {};
        if (vErrors === null) {
          vErrors = [err176];
        } else {
          vErrors.push(err176);
        }
        errors++;
      }
    }
    var _valid30 = _errs221 === errors;
    valid62 = valid62 || _valid30;
    const _errs222 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing108;
      if (data.value === void 0 && (missing108 = "value")) {
        const err177 = {};
        if (vErrors === null) {
          vErrors = [err177];
        } else {
          vErrors.push(err177);
        }
        errors++;
      }
    }
    var _valid30 = _errs222 === errors;
    valid62 = valid62 || _valid30;
    const _errs223 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing109;
      if (data.direction === void 0 && (missing109 = "direction")) {
        const err178 = {};
        if (vErrors === null) {
          vErrors = [err178];
        } else {
          vErrors.push(err178);
        }
        errors++;
      }
    }
    var _valid30 = _errs223 === errors;
    valid62 = valid62 || _valid30;
    const _errs224 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing110;
      if (data.amount === void 0 && (missing110 = "amount")) {
        const err179 = {};
        if (vErrors === null) {
          vErrors = [err179];
        } else {
          vErrors.push(err179);
        }
        errors++;
      }
    }
    var _valid30 = _errs224 === errors;
    valid62 = valid62 || _valid30;
    const _errs225 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing111;
      if (data.key === void 0 && (missing111 = "key")) {
        const err180 = {};
        if (vErrors === null) {
          vErrors = [err180];
        } else {
          vErrors.push(err180);
        }
        errors++;
      }
    }
    var _valid30 = _errs225 === errors;
    valid62 = valid62 || _valid30;
    const _errs226 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing112;
      if (data.ms === void 0 && (missing112 = "ms")) {
        const err181 = {};
        if (vErrors === null) {
          vErrors = [err181];
        } else {
          vErrors.push(err181);
        }
        errors++;
      }
    }
    var _valid30 = _errs226 === errors;
    valid62 = valid62 || _valid30;
    const _errs227 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing113;
      if (data.url === void 0 && (missing113 = "url")) {
        const err182 = {};
        if (vErrors === null) {
          vErrors = [err182];
        } else {
          vErrors.push(err182);
        }
        errors++;
      }
    }
    var _valid30 = _errs227 === errors;
    valid62 = valid62 || _valid30;
    const _errs228 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing114;
      if (data.reason === void 0 && (missing114 = "reason")) {
        const err183 = {};
        if (vErrors === null) {
          vErrors = [err183];
        } else {
          vErrors.push(err183);
        }
        errors++;
      }
    }
    var _valid30 = _errs228 === errors;
    valid62 = valid62 || _valid30;
    if (!valid62) {
      const err184 = {};
      if (vErrors === null) {
        vErrors = [err184];
      } else {
        vErrors.push(err184);
      }
      errors++;
    } else {
      errors = _errs219;
      if (vErrors !== null) {
        if (_errs219) {
          vErrors.length = _errs219;
        } else {
          vErrors = null;
        }
      }
    }
    var valid61 = _errs218 === errors;
    if (valid61) {
      const err185 = { instancePath, schemaPath: "#/allOf/19/then/not", keyword: "not", params: {}, message: "must NOT be valid" };
      if (vErrors === null) {
        vErrors = [err185];
      } else {
        vErrors.push(err185);
      }
      errors++;
    } else {
      errors = _errs217;
      if (vErrors !== null) {
        if (_errs217) {
          vErrors.length = _errs217;
        } else {
          vErrors = null;
        }
      }
    }
    var _valid29 = _errs216 === errors;
    valid59 = _valid29;
  }
  if (!valid59) {
    const err186 = { instancePath, schemaPath: "#/allOf/19/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err186];
    } else {
      vErrors.push(err186);
    }
    errors++;
  }
  const _errs230 = errors;
  let valid63 = true;
  const _errs231 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    let missing115;
    if (data.action === void 0 && (missing115 = "action")) {
      const err187 = {};
      if (vErrors === null) {
        vErrors = [err187];
      } else {
        vErrors.push(err187);
      }
      errors++;
    } else {
      if (data.action !== void 0) {
        if ("fail" !== data.action) {
          const err188 = {};
          if (vErrors === null) {
            vErrors = [err188];
          } else {
            vErrors.push(err188);
          }
          errors++;
        }
      }
    }
  }
  var _valid31 = _errs231 === errors;
  errors = _errs230;
  if (vErrors !== null) {
    if (_errs230) {
      vErrors.length = _errs230;
    } else {
      vErrors = null;
    }
  }
  if (_valid31) {
    const _errs233 = errors;
    const _errs234 = errors;
    const _errs235 = errors;
    const _errs236 = errors;
    let valid66 = false;
    const _errs237 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing116;
      if (data.target === void 0 && (missing116 = "target")) {
        const err189 = {};
        if (vErrors === null) {
          vErrors = [err189];
        } else {
          vErrors.push(err189);
        }
        errors++;
      }
    }
    var _valid32 = _errs237 === errors;
    valid66 = valid66 || _valid32;
    const _errs238 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing117;
      if (data.text === void 0 && (missing117 = "text")) {
        const err190 = {};
        if (vErrors === null) {
          vErrors = [err190];
        } else {
          vErrors.push(err190);
        }
        errors++;
      }
    }
    var _valid32 = _errs238 === errors;
    valid66 = valid66 || _valid32;
    const _errs239 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing118;
      if (data.value === void 0 && (missing118 = "value")) {
        const err191 = {};
        if (vErrors === null) {
          vErrors = [err191];
        } else {
          vErrors.push(err191);
        }
        errors++;
      }
    }
    var _valid32 = _errs239 === errors;
    valid66 = valid66 || _valid32;
    const _errs240 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing119;
      if (data.direction === void 0 && (missing119 = "direction")) {
        const err192 = {};
        if (vErrors === null) {
          vErrors = [err192];
        } else {
          vErrors.push(err192);
        }
        errors++;
      }
    }
    var _valid32 = _errs240 === errors;
    valid66 = valid66 || _valid32;
    const _errs241 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing120;
      if (data.amount === void 0 && (missing120 = "amount")) {
        const err193 = {};
        if (vErrors === null) {
          vErrors = [err193];
        } else {
          vErrors.push(err193);
        }
        errors++;
      }
    }
    var _valid32 = _errs241 === errors;
    valid66 = valid66 || _valid32;
    const _errs242 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing121;
      if (data.key === void 0 && (missing121 = "key")) {
        const err194 = {};
        if (vErrors === null) {
          vErrors = [err194];
        } else {
          vErrors.push(err194);
        }
        errors++;
      }
    }
    var _valid32 = _errs242 === errors;
    valid66 = valid66 || _valid32;
    const _errs243 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing122;
      if (data.ms === void 0 && (missing122 = "ms")) {
        const err195 = {};
        if (vErrors === null) {
          vErrors = [err195];
        } else {
          vErrors.push(err195);
        }
        errors++;
      }
    }
    var _valid32 = _errs243 === errors;
    valid66 = valid66 || _valid32;
    const _errs244 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing123;
      if (data.url === void 0 && (missing123 = "url")) {
        const err196 = {};
        if (vErrors === null) {
          vErrors = [err196];
        } else {
          vErrors.push(err196);
        }
        errors++;
      }
    }
    var _valid32 = _errs244 === errors;
    valid66 = valid66 || _valid32;
    const _errs245 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      let missing124;
      if (data.evidence === void 0 && (missing124 = "evidence")) {
        const err197 = {};
        if (vErrors === null) {
          vErrors = [err197];
        } else {
          vErrors.push(err197);
        }
        errors++;
      }
    }
    var _valid32 = _errs245 === errors;
    valid66 = valid66 || _valid32;
    if (!valid66) {
      const err198 = {};
      if (vErrors === null) {
        vErrors = [err198];
      } else {
        vErrors.push(err198);
      }
      errors++;
    } else {
      errors = _errs236;
      if (vErrors !== null) {
        if (_errs236) {
          vErrors.length = _errs236;
        } else {
          vErrors = null;
        }
      }
    }
    var valid65 = _errs235 === errors;
    if (valid65) {
      const err199 = { instancePath, schemaPath: "#/allOf/20/then/not", keyword: "not", params: {}, message: "must NOT be valid" };
      if (vErrors === null) {
        vErrors = [err199];
      } else {
        vErrors.push(err199);
      }
      errors++;
    } else {
      errors = _errs234;
      if (vErrors !== null) {
        if (_errs234) {
          vErrors.length = _errs234;
        } else {
          vErrors = null;
        }
      }
    }
    var _valid31 = _errs233 === errors;
    valid63 = _valid31;
  }
  if (!valid63) {
    const err200 = { instancePath, schemaPath: "#/allOf/20/if", keyword: "if", params: { failingKeyword: "then" }, message: 'must match "then" schema' };
    if (vErrors === null) {
      vErrors = [err200];
    } else {
      vErrors.push(err200);
    }
    errors++;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.action === void 0) {
      const err201 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
      if (vErrors === null) {
        vErrors = [err201];
      } else {
        vErrors.push(err201);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema33.properties, key0)) {
        const err202 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err202];
        } else {
          vErrors.push(err202);
        }
        errors++;
      }
    }
    if (data.action !== void 0) {
      let data21 = data.action;
      if (typeof data21 !== "string") {
        const err203 = { instancePath: instancePath + "/action", schemaPath: "#/$defs/actionName/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err203];
        } else {
          vErrors.push(err203);
        }
        errors++;
      }
      if (!(data21 === "click" || data21 === "type" || data21 === "select" || data21 === "check" || data21 === "scroll" || data21 === "hover" || data21 === "key" || data21 === "wait" || data21 === "navigate" || data21 === "ask_user" || data21 === "done" || data21 === "fail")) {
        const err204 = { instancePath: instancePath + "/action", schemaPath: "#/$defs/actionName/enum", keyword: "enum", params: { allowedValues: schema34.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err204];
        } else {
          vErrors.push(err204);
        }
        errors++;
      }
    }
    if (data.target !== void 0) {
      let data22 = data.target;
      if (data22 && typeof data22 == "object" && !Array.isArray(data22)) {
        if (data22.eid === void 0) {
          const err205 = { instancePath: instancePath + "/target", schemaPath: "#/$defs/target/required", keyword: "required", params: { missingProperty: "eid" }, message: "must have required property 'eid'" };
          if (vErrors === null) {
            vErrors = [err205];
          } else {
            vErrors.push(err205);
          }
          errors++;
        }
        if (data22.fp === void 0) {
          const err206 = { instancePath: instancePath + "/target", schemaPath: "#/$defs/target/required", keyword: "required", params: { missingProperty: "fp" }, message: "must have required property 'fp'" };
          if (vErrors === null) {
            vErrors = [err206];
          } else {
            vErrors.push(err206);
          }
          errors++;
        }
        for (const key1 in data22) {
          if (!(key1 === "fp" || key1 === "eid")) {
            const err207 = { instancePath: instancePath + "/target", schemaPath: "#/$defs/target/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err207];
            } else {
              vErrors.push(err207);
            }
            errors++;
          }
        }
        if (data22.fp !== void 0) {
          let data23 = data22.fp;
          if (typeof data23 === "string") {
            if (func2(data23) < 1) {
              const err208 = { instancePath: instancePath + "/target/fp", schemaPath: "#/$defs/target/properties/fp/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err208];
              } else {
                vErrors.push(err208);
              }
              errors++;
            }
          } else {
            const err209 = { instancePath: instancePath + "/target/fp", schemaPath: "#/$defs/target/properties/fp/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err209];
            } else {
              vErrors.push(err209);
            }
            errors++;
          }
        }
        if (data22.eid !== void 0) {
          let data24 = data22.eid;
          if (typeof data24 === "string") {
            if (!pattern4.test(data24)) {
              const err210 = { instancePath: instancePath + "/target/eid", schemaPath: "#/$defs/target/properties/eid/pattern", keyword: "pattern", params: { pattern: "^E[0-9]{1,6}$" }, message: 'must match pattern "^E[0-9]{1,6}$"' };
              if (vErrors === null) {
                vErrors = [err210];
              } else {
                vErrors.push(err210);
              }
              errors++;
            }
          } else {
            const err211 = { instancePath: instancePath + "/target/eid", schemaPath: "#/$defs/target/properties/eid/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err211];
            } else {
              vErrors.push(err211);
            }
            errors++;
          }
        }
      } else {
        const err212 = { instancePath: instancePath + "/target", schemaPath: "#/$defs/target/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err212];
        } else {
          vErrors.push(err212);
        }
        errors++;
      }
    }
    if (data.text !== void 0) {
      if (typeof data.text !== "string") {
        const err213 = { instancePath: instancePath + "/text", schemaPath: "#/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err213];
        } else {
          vErrors.push(err213);
        }
        errors++;
      }
    }
    if (data.value !== void 0) {
      if (typeof data.value !== "string") {
        const err214 = { instancePath: instancePath + "/value", schemaPath: "#/properties/value/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err214];
        } else {
          vErrors.push(err214);
        }
        errors++;
      }
    }
    if (data.direction !== void 0) {
      let data27 = data.direction;
      if (typeof data27 !== "string") {
        const err215 = { instancePath: instancePath + "/direction", schemaPath: "#/properties/direction/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err215];
        } else {
          vErrors.push(err215);
        }
        errors++;
      }
      if (!(data27 === "up" || data27 === "down")) {
        const err216 = { instancePath: instancePath + "/direction", schemaPath: "#/properties/direction/enum", keyword: "enum", params: { allowedValues: schema33.properties.direction.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err216];
        } else {
          vErrors.push(err216);
        }
        errors++;
      }
    }
    if (data.amount !== void 0) {
      let data28 = data.amount;
      if (!(typeof data28 == "number" && (!(data28 % 1) && !isNaN(data28)) && isFinite(data28))) {
        const err217 = { instancePath: instancePath + "/amount", schemaPath: "#/properties/amount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err217];
        } else {
          vErrors.push(err217);
        }
        errors++;
      }
    }
    if (data.key !== void 0) {
      if (typeof data.key !== "string") {
        const err218 = { instancePath: instancePath + "/key", schemaPath: "#/properties/key/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err218];
        } else {
          vErrors.push(err218);
        }
        errors++;
      }
    }
    if (data.ms !== void 0) {
      let data30 = data.ms;
      if (!(typeof data30 == "number" && (!(data30 % 1) && !isNaN(data30)) && isFinite(data30))) {
        const err219 = { instancePath: instancePath + "/ms", schemaPath: "#/properties/ms/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err219];
        } else {
          vErrors.push(err219);
        }
        errors++;
      }
      if (typeof data30 == "number" && isFinite(data30)) {
        if (data30 < 0 || isNaN(data30)) {
          const err220 = { instancePath: instancePath + "/ms", schemaPath: "#/properties/ms/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err220];
          } else {
            vErrors.push(err220);
          }
          errors++;
        }
      }
    }
    if (data.url !== void 0) {
      if (typeof data.url !== "string") {
        const err221 = { instancePath: instancePath + "/url", schemaPath: "#/properties/url/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err221];
        } else {
          vErrors.push(err221);
        }
        errors++;
      }
    }
    if (data.reason !== void 0) {
      if (typeof data.reason !== "string") {
        const err222 = { instancePath: instancePath + "/reason", schemaPath: "#/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err222];
        } else {
          vErrors.push(err222);
        }
        errors++;
      }
    }
    if (data.expect !== void 0) {
      let data33 = data.expect;
      if (data33 && typeof data33 == "object" && !Array.isArray(data33)) {
        if (Object.keys(data33).length < 1) {
          const err223 = { instancePath: instancePath + "/expect", schemaPath: "#/$defs/expect/minProperties", keyword: "minProperties", params: { limit: 1 }, message: "must NOT have fewer than 1 properties" };
          if (vErrors === null) {
            vErrors = [err223];
          } else {
            vErrors.push(err223);
          }
          errors++;
        }
        for (const key2 in data33) {
          if (!(key2 === "has_value" || key2 === "visible" || key2 === "enabled" || key2 === "modal_open" || key2 === "url_path_prefix" || key2 === "eid" || key2 === "no_validation_error" || key2 === "text_present")) {
            const err224 = { instancePath: instancePath + "/expect", schemaPath: "#/$defs/expect/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err224];
            } else {
              vErrors.push(err224);
            }
            errors++;
          }
        }
        if (data33.has_value !== void 0) {
          if (typeof data33.has_value !== "boolean") {
            const err225 = { instancePath: instancePath + "/expect/has_value", schemaPath: "#/$defs/expect/properties/has_value/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err225];
            } else {
              vErrors.push(err225);
            }
            errors++;
          }
        }
        if (data33.visible !== void 0) {
          if (typeof data33.visible !== "boolean") {
            const err226 = { instancePath: instancePath + "/expect/visible", schemaPath: "#/$defs/expect/properties/visible/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err226];
            } else {
              vErrors.push(err226);
            }
            errors++;
          }
        }
        if (data33.enabled !== void 0) {
          if (typeof data33.enabled !== "boolean") {
            const err227 = { instancePath: instancePath + "/expect/enabled", schemaPath: "#/$defs/expect/properties/enabled/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err227];
            } else {
              vErrors.push(err227);
            }
            errors++;
          }
        }
        if (data33.modal_open !== void 0) {
          if (typeof data33.modal_open !== "boolean") {
            const err228 = { instancePath: instancePath + "/expect/modal_open", schemaPath: "#/$defs/expect/properties/modal_open/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err228];
            } else {
              vErrors.push(err228);
            }
            errors++;
          }
        }
        if (data33.url_path_prefix !== void 0) {
          if (typeof data33.url_path_prefix !== "string") {
            const err229 = { instancePath: instancePath + "/expect/url_path_prefix", schemaPath: "#/$defs/expect/properties/url_path_prefix/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err229];
            } else {
              vErrors.push(err229);
            }
            errors++;
          }
        }
        if (data33.eid !== void 0) {
          let data39 = data33.eid;
          if (typeof data39 === "string") {
            if (!pattern4.test(data39)) {
              const err230 = { instancePath: instancePath + "/expect/eid", schemaPath: "#/$defs/expect/properties/eid/pattern", keyword: "pattern", params: { pattern: "^E[0-9]{1,6}$" }, message: 'must match pattern "^E[0-9]{1,6}$"' };
              if (vErrors === null) {
                vErrors = [err230];
              } else {
                vErrors.push(err230);
              }
              errors++;
            }
          } else {
            const err231 = { instancePath: instancePath + "/expect/eid", schemaPath: "#/$defs/expect/properties/eid/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err231];
            } else {
              vErrors.push(err231);
            }
            errors++;
          }
        }
        if (data33.no_validation_error !== void 0) {
          if (typeof data33.no_validation_error !== "boolean") {
            const err232 = { instancePath: instancePath + "/expect/no_validation_error", schemaPath: "#/$defs/expect/properties/no_validation_error/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err232];
            } else {
              vErrors.push(err232);
            }
            errors++;
          }
        }
        if (data33.text_present !== void 0) {
          let data41 = data33.text_present;
          if (typeof data41 === "string") {
            if (func2(data41) > 500) {
              const err233 = { instancePath: instancePath + "/expect/text_present", schemaPath: "#/$defs/expect/properties/text_present/maxLength", keyword: "maxLength", params: { limit: 500 }, message: "must NOT have more than 500 characters" };
              if (vErrors === null) {
                vErrors = [err233];
              } else {
                vErrors.push(err233);
              }
              errors++;
            }
          } else {
            const err234 = { instancePath: instancePath + "/expect/text_present", schemaPath: "#/$defs/expect/properties/text_present/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err234];
            } else {
              vErrors.push(err234);
            }
            errors++;
          }
        }
      } else {
        const err235 = { instancePath: instancePath + "/expect", schemaPath: "#/$defs/expect/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err235];
        } else {
          vErrors.push(err235);
        }
        errors++;
      }
    }
    if (data.evidence !== void 0) {
      let data42 = data.evidence;
      if (data42 && typeof data42 == "object" && !Array.isArray(data42)) {
        if (Object.keys(data42).length < 1) {
          const err236 = { instancePath: instancePath + "/evidence", schemaPath: "#/$defs/expect/minProperties", keyword: "minProperties", params: { limit: 1 }, message: "must NOT have fewer than 1 properties" };
          if (vErrors === null) {
            vErrors = [err236];
          } else {
            vErrors.push(err236);
          }
          errors++;
        }
        for (const key3 in data42) {
          if (!(key3 === "has_value" || key3 === "visible" || key3 === "enabled" || key3 === "modal_open" || key3 === "url_path_prefix" || key3 === "eid" || key3 === "no_validation_error" || key3 === "text_present")) {
            const err237 = { instancePath: instancePath + "/evidence", schemaPath: "#/$defs/expect/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err237];
            } else {
              vErrors.push(err237);
            }
            errors++;
          }
        }
        if (data42.has_value !== void 0) {
          if (typeof data42.has_value !== "boolean") {
            const err238 = { instancePath: instancePath + "/evidence/has_value", schemaPath: "#/$defs/expect/properties/has_value/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err238];
            } else {
              vErrors.push(err238);
            }
            errors++;
          }
        }
        if (data42.visible !== void 0) {
          if (typeof data42.visible !== "boolean") {
            const err239 = { instancePath: instancePath + "/evidence/visible", schemaPath: "#/$defs/expect/properties/visible/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err239];
            } else {
              vErrors.push(err239);
            }
            errors++;
          }
        }
        if (data42.enabled !== void 0) {
          if (typeof data42.enabled !== "boolean") {
            const err240 = { instancePath: instancePath + "/evidence/enabled", schemaPath: "#/$defs/expect/properties/enabled/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err240];
            } else {
              vErrors.push(err240);
            }
            errors++;
          }
        }
        if (data42.modal_open !== void 0) {
          if (typeof data42.modal_open !== "boolean") {
            const err241 = { instancePath: instancePath + "/evidence/modal_open", schemaPath: "#/$defs/expect/properties/modal_open/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err241];
            } else {
              vErrors.push(err241);
            }
            errors++;
          }
        }
        if (data42.url_path_prefix !== void 0) {
          if (typeof data42.url_path_prefix !== "string") {
            const err242 = { instancePath: instancePath + "/evidence/url_path_prefix", schemaPath: "#/$defs/expect/properties/url_path_prefix/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err242];
            } else {
              vErrors.push(err242);
            }
            errors++;
          }
        }
        if (data42.eid !== void 0) {
          let data48 = data42.eid;
          if (typeof data48 === "string") {
            if (!pattern4.test(data48)) {
              const err243 = { instancePath: instancePath + "/evidence/eid", schemaPath: "#/$defs/expect/properties/eid/pattern", keyword: "pattern", params: { pattern: "^E[0-9]{1,6}$" }, message: 'must match pattern "^E[0-9]{1,6}$"' };
              if (vErrors === null) {
                vErrors = [err243];
              } else {
                vErrors.push(err243);
              }
              errors++;
            }
          } else {
            const err244 = { instancePath: instancePath + "/evidence/eid", schemaPath: "#/$defs/expect/properties/eid/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err244];
            } else {
              vErrors.push(err244);
            }
            errors++;
          }
        }
        if (data42.no_validation_error !== void 0) {
          if (typeof data42.no_validation_error !== "boolean") {
            const err245 = { instancePath: instancePath + "/evidence/no_validation_error", schemaPath: "#/$defs/expect/properties/no_validation_error/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err245];
            } else {
              vErrors.push(err245);
            }
            errors++;
          }
        }
        if (data42.text_present !== void 0) {
          let data50 = data42.text_present;
          if (typeof data50 === "string") {
            if (func2(data50) > 500) {
              const err246 = { instancePath: instancePath + "/evidence/text_present", schemaPath: "#/$defs/expect/properties/text_present/maxLength", keyword: "maxLength", params: { limit: 500 }, message: "must NOT have more than 500 characters" };
              if (vErrors === null) {
                vErrors = [err246];
              } else {
                vErrors.push(err246);
              }
              errors++;
            }
          } else {
            const err247 = { instancePath: instancePath + "/evidence/text_present", schemaPath: "#/$defs/expect/properties/text_present/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err247];
            } else {
              vErrors.push(err247);
            }
            errors++;
          }
        }
      } else {
        const err248 = { instancePath: instancePath + "/evidence", schemaPath: "#/$defs/expect/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err248];
        } else {
          vErrors.push(err248);
        }
        errors++;
      }
    }
  } else {
    const err249 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err249];
    } else {
      vErrors.push(err249);
    }
    errors++;
  }
  validate22.errors = vErrors;
  return errors === 0;
}
validate22.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
var pattern7 = new RegExp("^S[a-z2-7]{10}$", "u");
function validate21(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate21.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.plan === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "plan" }, message: "must have required property 'plan'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.state_token === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "state_token" }, message: "must have required property 'state_token'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.schema === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "schema" }, message: "must have required property 'schema'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "plan" || key0 === "schema" || key0 === "state_token" || key0 === "plan_steps")) {
        const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.plan !== void 0) {
      let data0 = data.plan;
      if (Array.isArray(data0)) {
        if (data0.length < 1) {
          const err4 = { instancePath: instancePath + "/plan", schemaPath: "#/properties/plan/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        const len0 = data0.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (!validate22(data0[i0], { instancePath: instancePath + "/plan/" + i0, parentData: data0, parentDataProperty: i0, rootData, dynamicAnchors })) {
            vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err5 = { instancePath: instancePath + "/plan", schemaPath: "#/properties/plan/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.schema !== void 0) {
      if ("aegis/2" !== data.schema) {
        const err6 = { instancePath: instancePath + "/schema", schemaPath: "#/properties/schema/const", keyword: "const", params: { allowedValue: "aegis/2" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.state_token !== void 0) {
      let data3 = data.state_token;
      if (typeof data3 === "string") {
        if (!pattern7.test(data3)) {
          const err7 = { instancePath: instancePath + "/state_token", schemaPath: "#/properties/state_token/pattern", keyword: "pattern", params: { pattern: "^S[a-z2-7]{10}$" }, message: 'must match pattern "^S[a-z2-7]{10}$"' };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = { instancePath: instancePath + "/state_token", schemaPath: "#/properties/state_token/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.plan_steps !== void 0) {
      let data4 = data.plan_steps;
      if (Array.isArray(data4)) {
        if (data4.length > 8) {
          const err9 = { instancePath: instancePath + "/plan_steps", schemaPath: "#/properties/plan_steps/maxItems", keyword: "maxItems", params: { limit: 8 }, message: "must NOT have more than 8 items" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        if (data4.length < 1) {
          const err10 = { instancePath: instancePath + "/plan_steps", schemaPath: "#/properties/plan_steps/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        const len1 = data4.length;
        for (let i1 = 0; i1 < len1; i1++) {
          let data5 = data4[i1];
          if (typeof data5 === "string") {
            if (func2(data5) > 200) {
              const err11 = { instancePath: instancePath + "/plan_steps/" + i1, schemaPath: "#/properties/plan_steps/items/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
            if (func2(data5) < 1) {
              const err12 = { instancePath: instancePath + "/plan_steps/" + i1, schemaPath: "#/properties/plan_steps/items/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          } else {
            const err13 = { instancePath: instancePath + "/plan_steps/" + i1, schemaPath: "#/properties/plan_steps/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
      } else {
        const err14 = { instancePath: instancePath + "/plan_steps", schemaPath: "#/properties/plan_steps/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
  } else {
    const err15 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err15];
    } else {
      vErrors.push(err15);
    }
    errors++;
  }
  validate21.errors = vErrors;
  return errors === 0;
}
validate21.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
var schema41 = { "type": "object", "additionalProperties": false, "required": ["reason", "kind"], "properties": { "reason": { "type": "string", "minLength": 1, "maxLength": 300 }, "kind": { "enum": ["more_elements", "scroll_region", "higher_resolution"] } } };
function validate25(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate25.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.request_context === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "request_context" }, message: "must have required property 'request_context'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.state_token === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "state_token" }, message: "must have required property 'state_token'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.schema === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "schema" }, message: "must have required property 'schema'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "request_context" || key0 === "schema" || key0 === "state_token" || key0 === "plan_steps")) {
        const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.request_context !== void 0) {
      let data0 = data.request_context;
      if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
        if (data0.reason === void 0) {
          const err4 = { instancePath: instancePath + "/request_context", schemaPath: "#/$defs/contextRequest/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data0.kind === void 0) {
          const err5 = { instancePath: instancePath + "/request_context", schemaPath: "#/$defs/contextRequest/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        for (const key1 in data0) {
          if (!(key1 === "reason" || key1 === "kind")) {
            const err6 = { instancePath: instancePath + "/request_context", schemaPath: "#/$defs/contextRequest/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data0.reason !== void 0) {
          let data1 = data0.reason;
          if (typeof data1 === "string") {
            if (func2(data1) > 300) {
              const err7 = { instancePath: instancePath + "/request_context/reason", schemaPath: "#/$defs/contextRequest/properties/reason/maxLength", keyword: "maxLength", params: { limit: 300 }, message: "must NOT have more than 300 characters" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            if (func2(data1) < 1) {
              const err8 = { instancePath: instancePath + "/request_context/reason", schemaPath: "#/$defs/contextRequest/properties/reason/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          } else {
            const err9 = { instancePath: instancePath + "/request_context/reason", schemaPath: "#/$defs/contextRequest/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data0.kind !== void 0) {
          let data2 = data0.kind;
          if (!(data2 === "more_elements" || data2 === "scroll_region" || data2 === "higher_resolution")) {
            const err10 = { instancePath: instancePath + "/request_context/kind", schemaPath: "#/$defs/contextRequest/properties/kind/enum", keyword: "enum", params: { allowedValues: schema41.properties.kind.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
      } else {
        const err11 = { instancePath: instancePath + "/request_context", schemaPath: "#/$defs/contextRequest/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.schema !== void 0) {
      if ("aegis/2" !== data.schema) {
        const err12 = { instancePath: instancePath + "/schema", schemaPath: "#/properties/schema/const", keyword: "const", params: { allowedValue: "aegis/2" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.state_token !== void 0) {
      let data4 = data.state_token;
      if (typeof data4 === "string") {
        if (!pattern7.test(data4)) {
          const err13 = { instancePath: instancePath + "/state_token", schemaPath: "#/properties/state_token/pattern", keyword: "pattern", params: { pattern: "^S[a-z2-7]{10}$" }, message: 'must match pattern "^S[a-z2-7]{10}$"' };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      } else {
        const err14 = { instancePath: instancePath + "/state_token", schemaPath: "#/properties/state_token/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.plan_steps !== void 0) {
      let data5 = data.plan_steps;
      if (Array.isArray(data5)) {
        if (data5.length > 8) {
          const err15 = { instancePath: instancePath + "/plan_steps", schemaPath: "#/properties/plan_steps/maxItems", keyword: "maxItems", params: { limit: 8 }, message: "must NOT have more than 8 items" };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
        if (data5.length < 1) {
          const err16 = { instancePath: instancePath + "/plan_steps", schemaPath: "#/properties/plan_steps/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        const len0 = data5.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data6 = data5[i0];
          if (typeof data6 === "string") {
            if (func2(data6) > 200) {
              const err17 = { instancePath: instancePath + "/plan_steps/" + i0, schemaPath: "#/properties/plan_steps/items/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (func2(data6) < 1) {
              const err18 = { instancePath: instancePath + "/plan_steps/" + i0, schemaPath: "#/properties/plan_steps/items/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          } else {
            const err19 = { instancePath: instancePath + "/plan_steps/" + i0, schemaPath: "#/properties/plan_steps/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
      } else {
        const err20 = { instancePath: instancePath + "/plan_steps", schemaPath: "#/properties/plan_steps/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
  } else {
    const err21 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err21];
    } else {
      vErrors.push(err21);
    }
    errors++;
  }
  validate25.errors = vErrors;
  return errors === 0;
}
validate25.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
function validate20(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate20.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (!validate21(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })) {
    vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
    errors = vErrors.length;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
    var props0 = true;
  }
  const _errs2 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.answer === void 0) {
      const err0 = { instancePath, schemaPath: "#/$defs/answerResponse/required", keyword: "required", params: { missingProperty: "answer" }, message: "must have required property 'answer'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.state_token === void 0) {
      const err1 = { instancePath, schemaPath: "#/$defs/answerResponse/required", keyword: "required", params: { missingProperty: "state_token" }, message: "must have required property 'state_token'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.schema === void 0) {
      const err2 = { instancePath, schemaPath: "#/$defs/answerResponse/required", keyword: "required", params: { missingProperty: "schema" }, message: "must have required property 'schema'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "answer" || key0 === "schema" || key0 === "state_token" || key0 === "plan_steps")) {
        const err3 = { instancePath, schemaPath: "#/$defs/answerResponse/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.answer !== void 0) {
      let data0 = data.answer;
      if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
        if (data0.text === void 0) {
          const err4 = { instancePath: instancePath + "/answer", schemaPath: "#/$defs/answerResponse/properties/answer/required", keyword: "required", params: { missingProperty: "text" }, message: "must have required property 'text'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key1 in data0) {
          if (!(key1 === "text")) {
            const err5 = { instancePath: instancePath + "/answer", schemaPath: "#/$defs/answerResponse/properties/answer/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data0.text !== void 0) {
          if (typeof data0.text !== "string") {
            const err6 = { instancePath: instancePath + "/answer/text", schemaPath: "#/$defs/answerResponse/properties/answer/properties/text/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
      } else {
        const err7 = { instancePath: instancePath + "/answer", schemaPath: "#/$defs/answerResponse/properties/answer/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.schema !== void 0) {
      if ("aegis/2" !== data.schema) {
        const err8 = { instancePath: instancePath + "/schema", schemaPath: "#/$defs/answerResponse/properties/schema/const", keyword: "const", params: { allowedValue: "aegis/2" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.state_token !== void 0) {
      let data3 = data.state_token;
      if (typeof data3 === "string") {
        if (!pattern7.test(data3)) {
          const err9 = { instancePath: instancePath + "/state_token", schemaPath: "#/$defs/answerResponse/properties/state_token/pattern", keyword: "pattern", params: { pattern: "^S[a-z2-7]{10}$" }, message: 'must match pattern "^S[a-z2-7]{10}$"' };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      } else {
        const err10 = { instancePath: instancePath + "/state_token", schemaPath: "#/$defs/answerResponse/properties/state_token/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.plan_steps !== void 0) {
      let data4 = data.plan_steps;
      if (Array.isArray(data4)) {
        if (data4.length > 8) {
          const err11 = { instancePath: instancePath + "/plan_steps", schemaPath: "#/$defs/answerResponse/properties/plan_steps/maxItems", keyword: "maxItems", params: { limit: 8 }, message: "must NOT have more than 8 items" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (data4.length < 1) {
          const err12 = { instancePath: instancePath + "/plan_steps", schemaPath: "#/$defs/answerResponse/properties/plan_steps/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
        const len0 = data4.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data5 = data4[i0];
          if (typeof data5 === "string") {
            if (func2(data5) > 200) {
              const err13 = { instancePath: instancePath + "/plan_steps/" + i0, schemaPath: "#/$defs/answerResponse/properties/plan_steps/items/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if (func2(data5) < 1) {
              const err14 = { instancePath: instancePath + "/plan_steps/" + i0, schemaPath: "#/$defs/answerResponse/properties/plan_steps/items/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          } else {
            const err15 = { instancePath: instancePath + "/plan_steps/" + i0, schemaPath: "#/$defs/answerResponse/properties/plan_steps/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
      } else {
        const err16 = { instancePath: instancePath + "/plan_steps", schemaPath: "#/$defs/answerResponse/properties/plan_steps/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
  } else {
    const err17 = { instancePath, schemaPath: "#/$defs/answerResponse/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err17];
    } else {
      vErrors.push(err17);
    }
    errors++;
  }
  var _valid0 = _errs2 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
      if (props0 !== true) {
        props0 = true;
      }
    }
    const _errs18 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.extract === void 0) {
        const err18 = { instancePath, schemaPath: "#/$defs/extractResponse/required", keyword: "required", params: { missingProperty: "extract" }, message: "must have required property 'extract'" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      if (data.state_token === void 0) {
        const err19 = { instancePath, schemaPath: "#/$defs/extractResponse/required", keyword: "required", params: { missingProperty: "state_token" }, message: "must have required property 'state_token'" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      if (data.schema === void 0) {
        const err20 = { instancePath, schemaPath: "#/$defs/extractResponse/required", keyword: "required", params: { missingProperty: "schema" }, message: "must have required property 'schema'" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
      for (const key2 in data) {
        if (!(key2 === "extract" || key2 === "schema" || key2 === "state_token" || key2 === "plan_steps")) {
          const err21 = { instancePath, schemaPath: "#/$defs/extractResponse/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      if (data.extract !== void 0) {
        let data6 = data.extract;
        if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
          if (data6.data === void 0) {
            const err22 = { instancePath: instancePath + "/extract", schemaPath: "#/$defs/extractResponse/properties/extract/required", keyword: "required", params: { missingProperty: "data" }, message: "must have required property 'data'" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
          for (const key3 in data6) {
            if (!(key3 === "data")) {
              const err23 = { instancePath: instancePath + "/extract", schemaPath: "#/$defs/extractResponse/properties/extract/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          }
          if (data6.data !== void 0) {
            let data7 = data6.data;
            if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
            } else {
              const err24 = { instancePath: instancePath + "/extract/data", schemaPath: "#/$defs/extractResponse/properties/extract/properties/data/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
          }
        } else {
          const err25 = { instancePath: instancePath + "/extract", schemaPath: "#/$defs/extractResponse/properties/extract/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
      }
      if (data.schema !== void 0) {
        if ("aegis/2" !== data.schema) {
          const err26 = { instancePath: instancePath + "/schema", schemaPath: "#/$defs/extractResponse/properties/schema/const", keyword: "const", params: { allowedValue: "aegis/2" }, message: "must be equal to constant" };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
      }
      if (data.state_token !== void 0) {
        let data9 = data.state_token;
        if (typeof data9 === "string") {
          if (!pattern7.test(data9)) {
            const err27 = { instancePath: instancePath + "/state_token", schemaPath: "#/$defs/extractResponse/properties/state_token/pattern", keyword: "pattern", params: { pattern: "^S[a-z2-7]{10}$" }, message: 'must match pattern "^S[a-z2-7]{10}$"' };
            if (vErrors === null) {
              vErrors = [err27];
            } else {
              vErrors.push(err27);
            }
            errors++;
          }
        } else {
          const err28 = { instancePath: instancePath + "/state_token", schemaPath: "#/$defs/extractResponse/properties/state_token/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
      }
      if (data.plan_steps !== void 0) {
        let data10 = data.plan_steps;
        if (Array.isArray(data10)) {
          if (data10.length > 8) {
            const err29 = { instancePath: instancePath + "/plan_steps", schemaPath: "#/$defs/extractResponse/properties/plan_steps/maxItems", keyword: "maxItems", params: { limit: 8 }, message: "must NOT have more than 8 items" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
          if (data10.length < 1) {
            const err30 = { instancePath: instancePath + "/plan_steps", schemaPath: "#/$defs/extractResponse/properties/plan_steps/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
          const len1 = data10.length;
          for (let i1 = 0; i1 < len1; i1++) {
            let data11 = data10[i1];
            if (typeof data11 === "string") {
              if (func2(data11) > 200) {
                const err31 = { instancePath: instancePath + "/plan_steps/" + i1, schemaPath: "#/$defs/extractResponse/properties/plan_steps/items/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
              if (func2(data11) < 1) {
                const err32 = { instancePath: instancePath + "/plan_steps/" + i1, schemaPath: "#/$defs/extractResponse/properties/plan_steps/items/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
            } else {
              const err33 = { instancePath: instancePath + "/plan_steps/" + i1, schemaPath: "#/$defs/extractResponse/properties/plan_steps/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
          }
        } else {
          const err34 = { instancePath: instancePath + "/plan_steps", schemaPath: "#/$defs/extractResponse/properties/plan_steps/type", keyword: "type", params: { type: "array" }, message: "must be array" };
          if (vErrors === null) {
            vErrors = [err34];
          } else {
            vErrors.push(err34);
          }
          errors++;
        }
      }
    } else {
      const err35 = { instancePath, schemaPath: "#/$defs/extractResponse/type", keyword: "type", params: { type: "object" }, message: "must be object" };
      if (vErrors === null) {
        vErrors = [err35];
      } else {
        vErrors.push(err35);
      }
      errors++;
    }
    var _valid0 = _errs18 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
        if (props0 !== true) {
          props0 = true;
        }
      }
      const _errs35 = errors;
      if (!validate25(data, { instancePath, parentData, parentDataProperty, rootData, dynamicAnchors })) {
        vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
        errors = vErrors.length;
      }
      var _valid0 = _errs35 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
          if (props0 !== true) {
            props0 = true;
          }
        }
      }
    }
  }
  if (!valid0) {
    const err36 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err36];
    } else {
      vErrors.push(err36);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate20.errors = vErrors;
  evaluated0.props = props0;
  return errors === 0;
}
validate20.evaluated = { "dynamicProps": true, "dynamicItems": false };
export {
  planValidator_input_default as default,
  validate
};
