'use strict';
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.ValidateError = exports.ValidationService = exports.ValidateParam = void 0;
const validator_1 = __importDefault(require('validator'));
const assertNever_1 = require('../utils/assertNever');
const tsoa_route_1 = require('./tsoa-route');
// for backwards compatibility with custom templates
function ValidateParam(property, value, generatedModels, name = '', fieldErrors, parent = '', swaggerConfig) {
  return new ValidationService(generatedModels).ValidateParam(property, value, name, fieldErrors, parent, swaggerConfig);
}
exports.ValidateParam = ValidateParam;
class ValidationService {
  constructor(models) {
    this.models = models;
  }
  ValidateParam(property, rawValue, name = '', fieldErrors, parent = '', minimalSwaggerConfig) {
    let value = rawValue;
    // If undefined is allowed type, we can move to value validation
    if (value === undefined && property.dataType !== 'undefined') {
      // If there's either default value or datatype is union with undefined valid, we can just set it and move to validation
      if (property.default !== undefined || (property.dataType === 'union' && property.subSchemas?.some(p => p.dataType === 'undefined'))) {
        value = property.default;
      } else if (property.required) {
        // If value can be typed as undefined, there's no need to check mandatoriness here.
        let message = `'${name}' is required`;
        if (property.validators) {
          const validators = property.validators;
          Object.keys(validators).forEach(key => {
            const errorMsg = validators[key]?.errorMsg;
            if (key.startsWith('is') && errorMsg) {
              message = errorMsg;
            }
          });
        }
        fieldErrors[parent + name] = {
          message,
          value,
        };
        return;
      } else {
        return value;
      }
    }
    switch (property.dataType) {
      case 'string':
        return this.validateString(name, value, fieldErrors, property.validators, parent);
      case 'boolean':
        return this.validateBool(name, value, fieldErrors, property.validators, parent);
      case 'integer':
      case 'long':
        return this.validateInt(name, value, fieldErrors, property.validators, parent);
      case 'float':
      case 'double':
        return this.validateFloat(name, value, fieldErrors, property.validators, parent);
      case 'enum':
        return this.validateEnum(name, value, fieldErrors, property.enums, parent);
      case 'array':
        return this.validateArray(name, value, fieldErrors, minimalSwaggerConfig, property.array, property.validators, parent);
      case 'date':
        return this.validateDate(name, value, fieldErrors, property.validators, parent);
      case 'datetime':
        return this.validateDateTime(name, value, fieldErrors, property.validators, parent);
      case 'buffer':
        return this.validateBuffer(name, value);
      case 'union':
        return this.validateUnion(name, value, fieldErrors, minimalSwaggerConfig, property, parent);
      case 'intersection':
        return this.validateIntersection(name, value, fieldErrors, minimalSwaggerConfig, property.subSchemas, parent);
      case 'undefined':
        return this.validateUndefined(name, value, fieldErrors, parent);
      case 'any':
        return value;
      case 'nestedObjectLiteral':
        return this.validateNestedObjectLiteral(name, value, fieldErrors, minimalSwaggerConfig, property.nestedProperties, property.additionalProperties, parent);
      default:
        if (property.ref) {
          return this.validateModel({ name, value, modelDefinition: this.models[property.ref], fieldErrors, parent, minimalSwaggerConfig });
        }
        return value;
    }
  }
  validateNestedObjectLiteral(name, value, fieldErrors, swaggerConfig, nestedProperties, additionalProperties, parent) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      fieldErrors[parent + name] = {
        message: `invalid object`,
        value,
      };
      return;
    }
    const previousErrors = Object.keys(fieldErrors).length;
    if (!nestedProperties) {
      throw new Error(
        'internal tsoa error: ' +
          'the metadata that was generated should have had nested property schemas since it’s for a nested object,' +
          'however it did not. ' +
          'Please file an issue with tsoa at https://github.com/lukeautry/tsoa/issues',
      );
    }
    const propHandling = swaggerConfig.noImplicitAdditionalProperties;
    if (propHandling !== 'ignore') {
      const excessProps = this.getExcessPropertiesFor({ dataType: 'refObject', properties: nestedProperties, additionalProperties }, Object.keys(value), swaggerConfig);
      if (excessProps.length > 0) {
        if (propHandling === 'silently-remove-extras') {
          excessProps.forEach(excessProp => {
            delete value[excessProp];
          });
        }
        if (propHandling === 'throw-on-extras') {
          fieldErrors[parent + name] = {
            message: `"${excessProps.join(',')}" is an excess property and therefore is not allowed`,
            value: excessProps.reduce((acc, propName) => ({ [propName]: value[propName], ...acc }), {}),
          };
        }
      }
    }
    Object.keys(nestedProperties).forEach(key => {
      const validatedProp = this.ValidateParam(nestedProperties[key], value[key], key, fieldErrors, parent + name + '.', swaggerConfig);
      // Add value from validator if it's not undefined or if value is required and unfedined is valid type
      if (validatedProp !== undefined || (nestedProperties[key].dataType === 'undefined' && nestedProperties[key].required)) {
        value[key] = validatedProp;
      }
    });
    if (typeof additionalProperties === 'object' && typeof value === 'object') {
      const keys = Object.keys(value).filter(key => typeof nestedProperties[key] === 'undefined');
      keys.forEach(key => {
        const validatedProp = this.ValidateParam(additionalProperties, value[key], key, fieldErrors, parent + name + '.', swaggerConfig);
        // Add value from validator if it's not undefined or if value is required and unfedined is valid type
        if (validatedProp !== undefined || (additionalProperties.dataType === 'undefined' && additionalProperties.required)) {
          value[key] = validatedProp;
        }
      });
    }
    if (Object.keys(fieldErrors).length > previousErrors) {
      return;
    }
    return value;
  }
  validateInt(name, value, fieldErrors, validators, parent = '') {
    if (!validator_1.default.isInt(String(value))) {
      let message = `invalid integer number`;
      if (validators) {
        if (validators.isInt && validators.isInt.errorMsg) {
          message = validators.isInt.errorMsg;
        }
        if (validators.isLong && validators.isLong.errorMsg) {
          message = validators.isLong.errorMsg;
        }
      }
      fieldErrors[parent + name] = {
        message,
        value,
      };
      return;
    }
    const numberValue = validator_1.default.toInt(String(value), 10);
    if (!validators) {
      return numberValue;
    }
    if (validators.minimum && validators.minimum.value !== undefined) {
      if (validators.minimum.value > numberValue) {
        fieldErrors[parent + name] = {
          message: validators.minimum.errorMsg || `min ${validators.minimum.value}`,
          value,
        };
        return;
      }
    }
    if (validators.maximum && validators.maximum.value !== undefined) {
      if (validators.maximum.value < numberValue) {
        fieldErrors[parent + name] = {
          message: validators.maximum.errorMsg || `max ${validators.maximum.value}`,
          value,
        };
        return;
      }
    }
    return numberValue;
  }
  validateFloat(name, value, fieldErrors, validators, parent = '') {
    if (!validator_1.default.isFloat(String(value))) {
      let message = 'invalid float number';
      if (validators) {
        if (validators.isFloat && validators.isFloat.errorMsg) {
          message = validators.isFloat.errorMsg;
        }
        if (validators.isDouble && validators.isDouble.errorMsg) {
          message = validators.isDouble.errorMsg;
        }
      }
      fieldErrors[parent + name] = {
        message,
        value,
      };
      return;
    }
    const numberValue = validator_1.default.toFloat(String(value));
    if (!validators) {
      return numberValue;
    }
    if (validators.minimum && validators.minimum.value !== undefined) {
      if (validators.minimum.value > numberValue) {
        fieldErrors[parent + name] = {
          message: validators.minimum.errorMsg || `min ${validators.minimum.value}`,
          value,
        };
        return;
      }
    }
    if (validators.maximum && validators.maximum.value !== undefined) {
      if (validators.maximum.value < numberValue) {
        fieldErrors[parent + name] = {
          message: validators.maximum.errorMsg || `max ${validators.maximum.value}`,
          value,
        };
        return;
      }
    }
    return numberValue;
  }
  validateEnum(name, value, fieldErrors, members, parent = '') {
    if (!members || members.length === 0) {
      fieldErrors[parent + name] = {
        message: 'no member',
        value,
      };
      return;
    }
    const enumMatchIndex = members.map(member => String(member)).findIndex(member => validator_1.default.equals(member, String(value)));
    if (enumMatchIndex === -1) {
      const membersInQuotes = members.map(member => (typeof member === 'string' ? `'${member}'` : String(member)));
      fieldErrors[parent + name] = {
        message: `should be one of the following; [${membersInQuotes.join(',')}]`,
        value,
      };
      return;
    }
    return members[enumMatchIndex];
  }
  validateDate(name, value, fieldErrors, validators, parent = '') {
    if (!validator_1.default.isISO8601(String(value), { strict: true })) {
      const message = validators && validators.isDate && validators.isDate.errorMsg ? validators.isDate.errorMsg : `invalid ISO 8601 date format, i.e. YYYY-MM-DD`;
      fieldErrors[parent + name] = {
        message,
        value,
      };
      return;
    }
    const dateValue = new Date(String(value));
    if (!validators) {
      return dateValue;
    }
    if (validators.minDate && validators.minDate.value) {
      const minDate = new Date(validators.minDate.value);
      if (minDate.getTime() > dateValue.getTime()) {
        fieldErrors[parent + name] = {
          message: validators.minDate.errorMsg || `minDate '${validators.minDate.value}'`,
          value,
        };
        return;
      }
    }
    if (validators.maxDate && validators.maxDate.value) {
      const maxDate = new Date(validators.maxDate.value);
      if (maxDate.getTime() < dateValue.getTime()) {
        fieldErrors[parent + name] = {
          message: validators.maxDate.errorMsg || `maxDate '${validators.maxDate.value}'`,
          value,
        };
        return;
      }
    }
    return dateValue;
  }
  validateDateTime(name, value, fieldErrors, validators, parent = '') {
    if (!validator_1.default.isISO8601(String(value), { strict: true })) {
      const message = validators && validators.isDateTime && validators.isDateTime.errorMsg ? validators.isDateTime.errorMsg : `invalid ISO 8601 datetime format, i.e. YYYY-MM-DDTHH:mm:ss`;
      fieldErrors[parent + name] = {
        message,
        value,
      };
      return;
    }
    const datetimeValue = new Date(String(value));
    if (!validators) {
      return datetimeValue;
    }
    if (validators.minDate && validators.minDate.value) {
      const minDate = new Date(validators.minDate.value);
      if (minDate.getTime() > datetimeValue.getTime()) {
        fieldErrors[parent + name] = {
          message: validators.minDate.errorMsg || `minDate '${validators.minDate.value}'`,
          value,
        };
        return;
      }
    }
    if (validators.maxDate && validators.maxDate.value) {
      const maxDate = new Date(validators.maxDate.value);
      if (maxDate.getTime() < datetimeValue.getTime()) {
        fieldErrors[parent + name] = {
          message: validators.maxDate.errorMsg || `maxDate '${validators.maxDate.value}'`,
          value,
        };
        return;
      }
    }
    return datetimeValue;
  }
  validateString(name, value, fieldErrors, validators, parent = '') {
    if (typeof value !== 'string') {
      const message = validators && validators.isString && validators.isString.errorMsg ? validators.isString.errorMsg : `invalid string value`;
      fieldErrors[parent + name] = {
        message,
        value,
      };
      return;
    }
    const stringValue = String(value);
    if (!validators) {
      return stringValue;
    }
    if (validators.minLength && validators.minLength.value !== undefined) {
      if (validators.minLength.value > stringValue.length) {
        fieldErrors[parent + name] = {
          message: validators.minLength.errorMsg || `minLength ${validators.minLength.value}`,
          value,
        };
        return;
      }
    }
    if (validators.maxLength && validators.maxLength.value !== undefined) {
      if (validators.maxLength.value < stringValue.length) {
        fieldErrors[parent + name] = {
          message: validators.maxLength.errorMsg || `maxLength ${validators.maxLength.value}`,
          value,
        };
        return;
      }
    }
    if (validators.pattern && validators.pattern.value) {
      if (!validator_1.default.matches(String(stringValue), validators.pattern.value)) {
        fieldErrors[parent + name] = {
          message: validators.pattern.errorMsg || `Not match in '${validators.pattern.value}'`,
          value,
        };
        return;
      }
    }
    return stringValue;
  }
  validateBool(name, value, fieldErrors, validators, parent = '') {
    if (value === undefined || value === null) {
      return false;
    }
    if (value === true || value === false) {
      return value;
    }
    if (String(value).toLowerCase() === 'true') {
      return true;
    }
    if (String(value).toLowerCase() === 'false') {
      return false;
    }
    const message = validators && validators.isArray && validators.isArray.errorMsg ? validators.isArray.errorMsg : `invalid boolean value`;
    fieldErrors[parent + name] = {
      message,
      value,
    };
    return;
  }
  validateUndefined(name, value, fieldErrors, parent = '') {
    if (value === undefined) {
      return undefined;
    }
    const message = 'invalid undefined value';
    fieldErrors[parent + name] = {
      message,
      value,
    };
    return;
  }
  validateArray(name, value, fieldErrors, swaggerConfig, schema, validators, parent = '') {
    if (!schema || value === undefined) {
      const message = validators && validators.isArray && validators.isArray.errorMsg ? validators.isArray.errorMsg : `invalid array`;
      fieldErrors[parent + name] = {
        message,
        value,
      };
      return;
    }
    let arrayValue = [];
    const previousErrors = Object.keys(fieldErrors).length;
    if (Array.isArray(value)) {
      arrayValue = value.map((elementValue, index) => {
        return this.ValidateParam(schema, elementValue, `$${index}`, fieldErrors, name + '.', swaggerConfig);
      });
    } else {
      arrayValue = [this.ValidateParam(schema, value, '$0', fieldErrors, name + '.', swaggerConfig)];
    }
    if (Object.keys(fieldErrors).length > previousErrors) {
      return;
    }
    if (!validators) {
      return arrayValue;
    }
    if (validators.minItems && validators.minItems.value) {
      if (validators.minItems.value > arrayValue.length) {
        fieldErrors[parent + name] = {
          message: validators.minItems.errorMsg || `minItems ${validators.minItems.value}`,
          value,
        };
        return;
      }
    }
    if (validators.maxItems && validators.maxItems.value) {
      if (validators.maxItems.value < arrayValue.length) {
        fieldErrors[parent + name] = {
          message: validators.maxItems.errorMsg || `maxItems ${validators.maxItems.value}`,
          value,
        };
        return;
      }
    }
    if (validators.uniqueItems) {
      const unique = arrayValue.some((elem, index, arr) => {
        const indexOf = arr.indexOf(elem);
        return indexOf > -1 && indexOf !== index;
      });
      if (unique) {
        fieldErrors[parent + name] = {
          message: validators.uniqueItems.errorMsg || `required unique array`,
          value,
        };
        return;
      }
    }
    return arrayValue;
  }
  validateBuffer(_name, value) {
    return Buffer.from(value);
  }
  validateUnion(name, value, fieldErrors, swaggerConfig, property, parent = '') {
    if (!property.subSchemas) {
      throw new Error(
        'internal tsoa error: ' +
          'the metadata that was generated should have had sub schemas since it’s for a union, however it did not. ' +
          'Please file an issue with tsoa at https://github.com/lukeautry/tsoa/issues',
      );
    }
    const subFieldErrors = [];
    for (const subSchema of property.subSchemas) {
      const subFieldError = {};
      // Clean value if it's not undefined or use undefined directly if it's undefined.
      // Value can be undefined if undefined is allowed datatype of the union
      const validateableValue = value ? JSON.parse(JSON.stringify(value)) : value;
      const cleanValue = this.ValidateParam({ ...subSchema, validators: { ...property.validators, ...subSchema.validators } }, validateableValue, name, subFieldError, parent, swaggerConfig);
      subFieldErrors.push(subFieldError);
      if (Object.keys(subFieldError).length === 0) {
        return cleanValue;
      }
    }
    fieldErrors[parent + name] = {
      message: `Could not match the union against any of the items. Issues: ${JSON.stringify(subFieldErrors)}`,
      value,
    };
    return;
  }
  validateIntersection(name, value, fieldErrors, swaggerConfig, subSchemas, parent = '') {
    if (!subSchemas) {
      throw new Error(
        'internal tsoa error: ' +
          'the metadata that was generated should have had sub schemas since it’s for a intersection, however it did not. ' +
          'Please file an issue with tsoa at https://github.com/lukeautry/tsoa/issues',
      );
    }
    const subFieldErrors = [];
    let cleanValues = {};
    subSchemas.forEach(subSchema => {
      const subFieldError = {};
      const cleanValue = this.ValidateParam(subSchema, JSON.parse(JSON.stringify(value)), name, subFieldError, parent, { noImplicitAdditionalProperties: 'silently-remove-extras' });
      cleanValues = {
        ...cleanValues,
        ...cleanValue,
      };
      subFieldErrors.push(subFieldError);
    });
    const filtered = subFieldErrors.filter(subFieldError => Object.keys(subFieldError).length !== 0);
    if (filtered.length > 0) {
      fieldErrors[parent + name] = {
        message: `Could not match the intersection against every type. Issues: ${JSON.stringify(filtered)}`,
        value,
      };
      return;
    }
    const schemas = this.selfIntersectionCombinations(subSchemas.map(subSchema => this.toModelLike(subSchema)));
    const getRequiredPropError = schema => {
      const requiredPropError = {};
      this.validateModel({
        name,
        value: JSON.parse(JSON.stringify(value)),
        modelDefinition: schema,
        fieldErrors: requiredPropError,
        minimalSwaggerConfig: {
          noImplicitAdditionalProperties: 'ignore',
        },
      });
      return requiredPropError;
    };
    const schemasWithRequiredProps = schemas.filter(schema => Object.keys(getRequiredPropError(schema)).length === 0);
    if (swaggerConfig.noImplicitAdditionalProperties === 'ignore') {
      return { ...value, ...cleanValues };
    }
    if (swaggerConfig.noImplicitAdditionalProperties === 'silently-remove-extras') {
      if (schemasWithRequiredProps.length > 0) {
        return cleanValues;
      } else {
        fieldErrors[parent + name] = {
          message: `Could not match intersection against any of the possible combinations: ${JSON.stringify(schemas.map(s => Object.keys(s.properties)))}`,
          value,
        };
        return;
      }
    }
    if (schemasWithRequiredProps.length > 0 && schemasWithRequiredProps.some(schema => this.getExcessPropertiesFor(schema, Object.keys(value), swaggerConfig).length === 0)) {
      return cleanValues;
    } else {
      fieldErrors[parent + name] = {
        message: `Could not match intersection against any of the possible combinations: ${JSON.stringify(schemas.map(s => Object.keys(s.properties)))}`,
        value,
      };
      return;
    }
  }
  toModelLike(schema) {
    if (schema.ref) {
      const model = this.models[schema.ref];
      if (model.dataType === 'refObject') {
        return [model];
      } else if (model.dataType === 'refAlias') {
        return [...this.toModelLike(model.type)];
      } else if (model.dataType === 'refEnum') {
        throw new Error(`Can't transform an enum into a model like structure because it does not have properties.`);
      } else {
        return (0, assertNever_1.assertNever)(model);
      }
    } else if (schema.nestedProperties) {
      return [{ dataType: 'refObject', properties: schema.nestedProperties, additionalProperties: schema.additionalProperties }];
    } else if (schema.subSchemas && schema.dataType === 'intersection') {
      const modelss = schema.subSchemas.map(subSchema => this.toModelLike(subSchema));
      return this.selfIntersectionCombinations(modelss);
    } else if (schema.subSchemas && schema.dataType === 'union') {
      const modelss = schema.subSchemas.map(subSchema => this.toModelLike(subSchema));
      return modelss.reduce((acc, models) => [...acc, ...models], []);
    } else {
      // There are no properties to check for excess here.
      return [{ dataType: 'refObject', properties: {}, additionalProperties: false }];
    }
  }
  /**
   * combine all schemas once, ignoring order ie
   * input: [[value1], [value2]] should be [[value1, value2]]
   * not [[value1, value2],[value2, value1]]
   * and
   * input: [[value1, value2], [value3, value4], [value5, value6]] should be [
   *   [value1, value3, value5],
   *   [value1, value3, value6],
   *   [value1, value4, value5],
   *   [value1, value4, value6],
   *   [value2, value3, value5],
   *   [value2, value3, value6],
   *   [value2, value4, value5],
   *   [value2, value4, value6],
   * ]
   * @param modelSchemass
   */
  selfIntersectionCombinations(modelSchemass) {
    const res = [];
    // Picks one schema from each sub-array
    const combinations = this.getAllCombinations(modelSchemass);
    for (const combination of combinations) {
      // Combine all schemas of this combination
      let currentCollector = { ...combination[0] };
      for (let subSchemaIdx = 1; subSchemaIdx < combination.length; subSchemaIdx++) {
        currentCollector = { ...this.combineProperties(currentCollector, combination[subSchemaIdx]) };
      }
      res.push(currentCollector);
    }
    return res;
  }
  getAllCombinations(arrays) {
    function combine(current, index) {
      if (index === arrays.length) {
        result.push(current.slice());
        return;
      }
      for (let i = 0; i < arrays[index].length; i++) {
        current.push(arrays[index][i]);
        combine(current, index + 1);
        current.pop();
      }
    }
    const result = [];
    combine([], 0);
    return result;
  }
  combineProperties(a, b) {
    return { dataType: 'refObject', properties: { ...a.properties, ...b.properties }, additionalProperties: a.additionalProperties || b.additionalProperties || false };
  }
  getExcessPropertiesFor(modelDefinition, properties, config) {
    const modelProperties = new Set(Object.keys(modelDefinition.properties));
    if (modelDefinition.additionalProperties) {
      return [];
    } else if (config.noImplicitAdditionalProperties === 'ignore') {
      return [];
    } else {
      return [...properties].filter(property => !modelProperties.has(property));
    }
  }
  validateModel(input) {
    const { name, value, modelDefinition, fieldErrors, parent = '', minimalSwaggerConfig: swaggerConfig } = input;
    const previousErrors = Object.keys(fieldErrors).length;
    if (modelDefinition) {
      if (modelDefinition.dataType === 'refEnum') {
        return this.validateEnum(name, value, fieldErrors, modelDefinition.enums, parent);
      }
      if (modelDefinition.dataType === 'refAlias') {
        return this.ValidateParam(modelDefinition.type, value, name, fieldErrors, parent, swaggerConfig);
      }
      const fieldPath = parent + name;
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        fieldErrors[fieldPath] = {
          message: `invalid object`,
          value,
        };
        return;
      }
      const properties = modelDefinition.properties || {};
      const keysOnPropertiesModelDefinition = new Set(Object.keys(properties));
      const allPropertiesOnData = new Set(Object.keys(value));
      Object.entries(properties).forEach(([key, property]) => {
        const validatedParam = this.ValidateParam(property, value[key], key, fieldErrors, fieldPath + '.', swaggerConfig);
        // Add value from validator if it's not undefined or if value is required and unfedined is valid type
        if (validatedParam !== undefined || (property.dataType === 'undefined' && property.required)) {
          value[key] = validatedParam;
        }
      });
      const isAnExcessProperty = objectKeyThatMightBeExcess => {
        return allPropertiesOnData.has(objectKeyThatMightBeExcess) && !keysOnPropertiesModelDefinition.has(objectKeyThatMightBeExcess);
      };
      const additionalProperties = modelDefinition.additionalProperties;
      if (additionalProperties === true || (0, tsoa_route_1.isDefaultForAdditionalPropertiesAllowed)(additionalProperties)) {
        // then don't validate any of the additional properties
      } else if (additionalProperties === false) {
        Object.keys(value).forEach(key => {
          if (isAnExcessProperty(key)) {
            if (swaggerConfig.noImplicitAdditionalProperties === 'throw-on-extras') {
              fieldErrors[`${fieldPath}.${key}`] = {
                message: `"${key}" is an excess property and therefore is not allowed`,
                value: key,
              };
            } else if (swaggerConfig.noImplicitAdditionalProperties === 'silently-remove-extras') {
              delete value[key];
            } else if (swaggerConfig.noImplicitAdditionalProperties === 'ignore') {
              // then it's okay to have additionalProperties
            } else {
              (0, assertNever_1.assertNever)(swaggerConfig.noImplicitAdditionalProperties);
            }
          }
        });
      } else {
        Object.keys(value).forEach(key => {
          if (isAnExcessProperty(key)) {
            const validatedValue = this.ValidateParam(additionalProperties, value[key], key, fieldErrors, fieldPath + '.', swaggerConfig);
            // Add value from validator if it's not undefined or if value is required and unfedined is valid type
            if (validatedValue !== undefined || (additionalProperties.dataType === 'undefined' && additionalProperties.required)) {
              value[key] = validatedValue;
            } else {
              fieldErrors[`${fieldPath}.${key}`] = {
                message: `No matching model found in additionalProperties to validate ${key}`,
                value: key,
              };
            }
          }
        });
      }
    }
    if (Object.keys(fieldErrors).length > previousErrors) {
      return;
    }
    return value;
  }
}
exports.ValidationService = ValidationService;
class ValidateError extends Error {
  constructor(fields, message) {
    super(message);
    this.fields = fields;
    this.message = message;
    this.status = 400;
    this.name = 'ValidateError';
    Object.setPrototypeOf(this, ValidateError.prototype);
  }
}
exports.ValidateError = ValidateError;
//# sourceMappingURL=templateHelpers.js.map
