'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.SpecGenerator2 = void 0;
const runtime_1 = require('@tsoa/runtime');
const isVoidType_1 = require('../utils/isVoidType');
const pathUtils_1 = require('./../utils/pathUtils');
const swaggerUtils_1 = require('./../utils/swaggerUtils');
const specGenerator_1 = require('./specGenerator');
const validatorUtils_1 = require('../utils/validatorUtils');
class SpecGenerator2 extends specGenerator_1.SpecGenerator {
  constructor(metadata, config) {
    super(metadata, config);
    this.metadata = metadata;
    this.config = config;
  }
  GetSpec() {
    let spec = {
      basePath: (0, pathUtils_1.normalisePath)(this.config.basePath, '/', undefined, false),
      consumes: [swaggerUtils_1.DEFAULT_REQUEST_MEDIA_TYPE],
      definitions: this.buildDefinitions(),
      info: {
        title: '',
      },
      paths: this.buildPaths(),
      produces: [swaggerUtils_1.DEFAULT_RESPONSE_MEDIA_TYPE],
      swagger: '2.0',
    };
    const securityDefinitions = this.config.securityDefinitions ? this.config.securityDefinitions : {};
    const supportedSchemes = ['basic', 'apiKey', 'oauth2'];
    for (const { type } of Object.values(securityDefinitions)) {
      if (!supportedSchemes.includes(type)) {
        throw new Error(`Swagger 2.0 does not support "${type}" security scheme (allowed values: ${supportedSchemes.join(',')})`);
      }
    }
    spec.securityDefinitions = securityDefinitions;
    if (this.config.name) {
      spec.info.title = this.config.name;
    }
    if (this.config.version) {
      spec.info.version = this.config.version;
    }
    if (this.config.host) {
      spec.host = this.config.host;
    }
    if (this.config.description) {
      spec.info.description = this.config.description;
    }
    if (this.config.termsOfService) {
      spec.info.termsOfService = this.config.termsOfService;
    }
    if (this.config.tags) {
      spec.tags = this.config.tags;
    }
    if (this.config.license) {
      spec.info.license = { name: this.config.license };
    }
    if (this.config.contact) {
      spec.info.contact = this.config.contact;
    }
    if (this.config.spec) {
      this.config.specMerging = this.config.specMerging || 'immediate';
      const mergeFuncs = {
        immediate: Object.assign,
        recursive: require('merge-anything').merge,
        deepmerge: (spec, merge) => require('deepmerge').all([spec, merge]),
      };
      spec = mergeFuncs[this.config.specMerging](spec, this.config.spec);
    }
    if (this.config.schemes) {
      spec.schemes = this.config.schemes;
    }
    return spec;
  }
  buildDefinitions() {
    const definitions = {};
    Object.keys(this.metadata.referenceTypeMap).map(typeName => {
      const referenceType = this.metadata.referenceTypeMap[typeName];
      if (referenceType.dataType === 'refObject') {
        const required = referenceType.properties.filter(p => this.isRequiredWithoutDefault(p) && !this.hasUndefined(p)).map(p => p.name);
        definitions[referenceType.refName] = {
          description: referenceType.description,
          properties: this.buildProperties(referenceType.properties),
          required: required && required.length > 0 ? Array.from(new Set(required)) : undefined,
          type: 'object',
        };
        if (referenceType.additionalProperties) {
          definitions[referenceType.refName].additionalProperties = this.buildAdditionalProperties(referenceType.additionalProperties);
        } else {
          // Since additionalProperties was not explicitly set in the TypeScript interface for this model
          //      ...we need to make a decision
          definitions[referenceType.refName].additionalProperties = this.determineImplicitAdditionalPropertiesValue();
        }
        if (referenceType.example) {
          definitions[referenceType.refName].example = referenceType.example;
        }
      } else if (referenceType.dataType === 'refEnum') {
        definitions[referenceType.refName] = {
          description: referenceType.description,
          enum: referenceType.enums,
          type: this.decideEnumType(referenceType.enums, referenceType.refName),
        };
        if (this.config.xEnumVarnames && referenceType.enumVarnames !== undefined && referenceType.enums.length === referenceType.enumVarnames.length) {
          definitions[referenceType.refName]['x-enum-varnames'] = referenceType.enumVarnames;
        }
      } else if (referenceType.dataType === 'refAlias') {
        const swaggerType = this.getSwaggerType(referenceType.type);
        const format = referenceType.format;
        const validators = Object.keys(referenceType.validators)
          .filter(validatorUtils_1.shouldIncludeValidatorInSchema)
          .reduce((acc, key) => {
            return {
              ...acc,
              [key]: referenceType.validators[key].value,
            };
          }, {});
        definitions[referenceType.refName] = {
          ...swaggerType,
          default: referenceType.default || swaggerType.default,
          example: referenceType.example,
          format: format || swaggerType.format,
          description: referenceType.description,
          ...validators,
        };
      } else {
        (0, runtime_1.assertNever)(referenceType);
      }
      if (referenceType.deprecated) {
        definitions[referenceType.refName]['x-deprecated'] = true;
      }
    });
    return definitions;
  }
  buildPaths() {
    const paths = {};
    this.metadata.controllers.forEach(controller => {
      const normalisedControllerPath = (0, pathUtils_1.normalisePath)(controller.path, '/');
      // construct documentation using all methods except @Hidden
      controller.methods
        .filter(method => !method.isHidden)
        .forEach(method => {
          const normalisedMethodPath = (0, pathUtils_1.normalisePath)(method.path, '/');
          let path = (0, pathUtils_1.normalisePath)(`${normalisedControllerPath}${normalisedMethodPath}`, '/', '', false);
          path = (0, pathUtils_1.convertColonPathParams)(path);
          paths[path] = paths[path] || {};
          this.buildMethod(controller.name, method, paths[path], controller.produces);
        });
    });
    return paths;
  }
  buildMethod(controllerName, method, pathObject, defaultProduces) {
    const pathMethod = (pathObject[method.method] = this.buildOperation(controllerName, method, defaultProduces));
    pathMethod.description = method.description;
    pathMethod.summary = method.summary;
    pathMethod.tags = method.tags;
    // Use operationId tag otherwise fallback to generated. Warning: This doesn't check uniqueness.
    pathMethod.operationId = method.operationId || pathMethod.operationId;
    if (method.deprecated) {
      pathMethod.deprecated = method.deprecated;
    }
    if (method.security) {
      pathMethod.security = method.security;
    }
    const queriesParams = method.parameters.filter(p => p.in === 'queries');
    pathMethod.parameters = method.parameters
      .filter(p => {
        return ['request', 'body-prop', 'res', 'queries'].indexOf(p.in) === -1;
      })
      .map(p => this.buildParameter(p));
    if (queriesParams.length > 1) {
      throw new Error('Only one queries parameter allowed per controller method.');
    }
    if (queriesParams.length === 1) {
      pathMethod.parameters.push(...this.buildQueriesParameter(queriesParams[0]));
    }
    const bodyPropParameter = this.buildBodyPropParameter(controllerName, method);
    if (bodyPropParameter) {
      pathMethod.parameters.push(bodyPropParameter);
    }
    if (pathMethod.parameters.filter(p => p.in === 'body').length > 1) {
      throw new Error('Only one body parameter allowed per controller method.');
    }
    method.extensions.forEach(ext => (pathMethod[ext.key] = ext.value));
  }
  buildOperation(controllerName, method, defaultProduces) {
    const swaggerResponses = {};
    let produces = [];
    method.responses.forEach(res => {
      swaggerResponses[res.name] = {
        description: res.description,
      };
      if (res.schema && !(0, isVoidType_1.isVoidType)(res.schema)) {
        if (res.produces) {
          produces.push(...res.produces);
        }
        swaggerResponses[res.name].schema = this.getSwaggerType(res.schema);
      }
      if (res.examples && res.examples[0]) {
        if ((res.exampleLabels?.filter(e => e).length || 0) > 0) {
          console.warn('Example labels are not supported in OpenAPI 2');
        }
        swaggerResponses[res.name].examples = { [swaggerUtils_1.DEFAULT_RESPONSE_MEDIA_TYPE]: res.examples[0] };
      }
      if (res.headers) {
        const headers = {};
        if (res.headers.dataType === 'refObject' || res.headers.dataType === 'nestedObjectLiteral') {
          res.headers.properties.forEach(each => {
            headers[each.name] = {
              ...this.getSwaggerType(each.type),
              description: each.description,
            };
          });
        } else {
          (0, runtime_1.assertNever)(res.headers);
        }
        swaggerResponses[res.name].headers = headers;
      }
    });
    produces = Array.from(new Set(produces.filter(p => p !== undefined)));
    if (produces.length === 0) {
      produces = defaultProduces || [swaggerUtils_1.DEFAULT_RESPONSE_MEDIA_TYPE];
    }
    const operation = {
      operationId: this.getOperationId(controllerName, method),
      produces: produces,
      responses: swaggerResponses,
    };
    const hasBody = method.parameters.some(p => p.in === 'body');
    const hasFormData = method.parameters.some(p => p.in === 'formData');
    if (hasBody || hasFormData) {
      operation.consumes = [];
      if (hasBody) {
        operation.consumes.push(method.consumes || swaggerUtils_1.DEFAULT_REQUEST_MEDIA_TYPE);
      }
      if (hasFormData) {
        operation.consumes.push('multipart/form-data');
      }
    }
    return operation;
  }
  buildBodyPropParameter(controllerName, method) {
    const properties = {};
    const required = [];
    method.parameters
      .filter(p => p.in === 'body-prop')
      .forEach(p => {
        properties[p.name] = this.getSwaggerType(p.type);
        properties[p.name].default = p.default;
        properties[p.name].description = p.description;
        properties[p.name].example = p.example === undefined ? undefined : p.example[0];
        if (this.isRequiredWithoutDefault(p)) {
          required.push(p.name);
        }
      });
    if (!Object.keys(properties).length) {
      return;
    }
    const parameter = {
      in: 'body',
      name: 'body',
      schema: {
        properties,
        title: `${this.getOperationId(controllerName, method)}Body`,
        type: 'object',
      },
    };
    if (required.length) {
      parameter.schema.required = required;
    }
    return parameter;
  }
  buildQueriesParameter(source) {
    if (source.type.dataType === 'refObject' || source.type.dataType === 'nestedObjectLiteral') {
      const properties = source.type.properties;
      return properties.map(property => this.buildParameter(this.queriesPropertyToQueryParameter(property)));
    }
    throw new Error(`Queries '${source.name}' parameter must be an object.`);
  }
  buildParameter(source) {
    let parameter = {
      default: source.default,
      description: source.description,
      in: source.in,
      name: source.name,
      required: this.isRequiredWithoutDefault(source),
    };
    if (source.deprecated) {
      parameter['x-deprecated'] = true;
    }
    let type = source.type;
    if (source.in !== 'body' && source.type.dataType === 'refEnum') {
      // swagger does not support referencing enums
      // (except for body parameters), so we have to inline it
      type = {
        dataType: 'enum',
        enums: source.type.enums,
      };
    }
    const parameterType = this.getSwaggerType(type);
    if (parameterType.format) {
      parameter.format = this.throwIfNotDataFormat(parameterType.format);
    }
    if (runtime_1.Swagger.isQueryParameter(parameter) && parameterType.type === 'array') {
      parameter.collectionFormat = 'multi';
    }
    if (parameterType.$ref) {
      parameter.schema = parameterType;
      return parameter;
    }
    const validatorObjs = {};
    Object.keys(source.validators)
      .filter(validatorUtils_1.shouldIncludeValidatorInSchema)
      .forEach(key => {
        validatorObjs[key] = source.validators[key].value;
      });
    if (source.in === 'body' && source.type.dataType === 'array') {
      parameter.schema = {
        items: parameterType.items,
        type: 'array',
      };
    } else {
      if (source.type.dataType === 'any') {
        if (source.in === 'body') {
          parameter.schema = { type: 'object' };
        } else {
          parameter.type = 'string';
        }
      } else {
        if (parameterType.type) {
          parameter.type = this.throwIfNotDataType(parameterType.type);
        }
        parameter.items = parameterType.items;
        parameter.enum = parameterType.enum;
      }
    }
    if (parameter.schema) {
      parameter.schema = Object.assign({}, parameter.schema, validatorObjs);
    } else {
      parameter = Object.assign({}, parameter, validatorObjs);
    }
    return parameter;
  }
  buildProperties(source) {
    const properties = {};
    source.forEach(property => {
      let swaggerType = this.getSwaggerType(property.type);
      const format = property.format;
      swaggerType.description = property.description;
      swaggerType.example = property.example;
      swaggerType.format = format || swaggerType.format;
      if (!swaggerType.$ref) {
        swaggerType.default = property.default;
        Object.keys(property.validators)
          .filter(validatorUtils_1.shouldIncludeValidatorInSchema)
          .forEach(key => {
            swaggerType = { ...swaggerType, [key]: property.validators[key].value };
          });
      }
      if (property.deprecated) {
        swaggerType['x-deprecated'] = true;
      }
      if (property.extensions) {
        property.extensions.forEach(property => {
          swaggerType[property.key] = property.value;
        });
      }
      properties[property.name] = swaggerType;
    });
    return properties;
  }
  getSwaggerTypeForUnionType(type) {
    const typesWithoutUndefined = type.types.filter(x => x.dataType !== 'undefined');
    // Backwards compatible representation of a literal enumeration
    if (typesWithoutUndefined.every(subType => subType.dataType === 'enum')) {
      const mergedEnum = { dataType: 'enum', enums: [] };
      typesWithoutUndefined.forEach(t => {
        mergedEnum.enums = [...mergedEnum.enums, ...t.enums];
      });
      return this.getSwaggerTypeForEnumType(mergedEnum);
    } else if (typesWithoutUndefined.length === 2 && typesWithoutUndefined.find(typeInUnion => typeInUnion.dataType === 'enum' && typeInUnion.enums.includes(null))) {
      // Backwards compatible representation of dataType or null, $ref does not allow any sibling attributes, so we have to bail out
      const nullEnumIndex = typesWithoutUndefined.findIndex(type => type.dataType === 'enum' && type.enums.includes(null));
      const typeIndex = nullEnumIndex === 1 ? 0 : 1;
      const swaggerType = this.getSwaggerType(typesWithoutUndefined[typeIndex]);
      const isRef = !!swaggerType.$ref;
      if (isRef) {
        return { type: 'object' };
      } else {
        swaggerType['x-nullable'] = true;
        return swaggerType;
      }
    } else if (process.env.NODE_ENV !== 'tsoa_test') {
      // eslint-disable-next-line no-console
      console.warn('Swagger 2.0 does not support union types beyond string literals.\n' + 'If you would like to take advantage of this, please change tsoa.json\'s "specVersion" to 3.');
    }
    return { type: 'object' };
  }
  getSwaggerTypeForIntersectionType(type) {
    const properties = type.types.reduce((acc, type) => {
      if (type.dataType === 'refObject') {
        let refType = type;
        refType = this.metadata.referenceTypeMap[refType.refName];
        const props =
          refType &&
          refType.properties &&
          refType.properties.reduce((acc, prop) => {
            return {
              ...acc,
              [prop.name]: this.getSwaggerType(prop.type),
            };
          }, {});
        return { ...acc, ...props };
      } else {
        process.env.NODE_ENV !== 'tsoa_test' &&
          // eslint-disable-next-line no-console
          console.warn('Swagger 2.0 does not fully support this kind of intersection types. If you would like to take advantage of this, please change tsoa.json\'s "specVersion" to 3.');
        return { ...acc };
      }
    }, {});
    return { type: 'object', properties };
  }
  getSwaggerTypeForReferenceType(referenceType) {
    return { $ref: `#/definitions/${encodeURIComponent(referenceType.refName)}` };
  }
  decideEnumType(anEnum, nameOfEnum) {
    const typesUsedInEnum = this.determineTypesUsedInEnum(anEnum);
    const badEnumErrorMessage = () => {
      const valuesDelimited = Array.from(typesUsedInEnum).join(',');
      return `Enums can only have string or number values, but enum ${nameOfEnum} had ${valuesDelimited}`;
    };
    let enumTypeForSwagger;
    if (typesUsedInEnum.has('string') && typesUsedInEnum.size === 1) {
      enumTypeForSwagger = 'string';
    } else if (typesUsedInEnum.has('number') && typesUsedInEnum.size === 1) {
      enumTypeForSwagger = 'number';
    } else {
      throw new Error(badEnumErrorMessage());
    }
    return enumTypeForSwagger;
  }
  getSwaggerTypeForEnumType(enumType) {
    const types = this.determineTypesUsedInEnum(enumType.enums);
    const type = types.size === 1 ? types.values().next().value : 'string';
    const nullable = enumType.enums.includes(null) ? true : false;
    return { type, enum: enumType.enums.map(member => (0, swaggerUtils_1.getValue)(type, member)), ['x-nullable']: nullable };
  }
}
exports.SpecGenerator2 = SpecGenerator2;
//# sourceMappingURL=specGenerator2.js.map
