'use strict';
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.AbstractRouteGenerator = void 0;
const path = __importStar(require('path'));
const runtime_1 = require('@tsoa/runtime');
const internalTypeGuards_1 = require('../utils/internalTypeGuards');
const pathUtils_1 = require('../utils/pathUtils');
const fs_1 = require('../utils/fs');
class AbstractRouteGenerator {
  constructor(metadata, options) {
    this.metadata = metadata;
    this.options = options;
  }
  buildModels() {
    const models = {};
    Object.keys(this.metadata.referenceTypeMap).forEach(name => {
      const referenceType = this.metadata.referenceTypeMap[name];
      let model;
      if (referenceType.dataType === 'refEnum') {
        const refEnumModel = {
          dataType: 'refEnum',
          enums: referenceType.enums,
        };
        model = refEnumModel;
      } else if (referenceType.dataType === 'refObject') {
        const propertySchemaDictionary = {};
        referenceType.properties.forEach(property => {
          propertySchemaDictionary[property.name] = this.buildPropertySchema(property);
        });
        const refObjModel = {
          dataType: 'refObject',
          properties: propertySchemaDictionary,
        };
        if (referenceType.additionalProperties) {
          refObjModel.additionalProperties = this.buildProperty(referenceType.additionalProperties);
        } else if (this.options.noImplicitAdditionalProperties !== 'ignore') {
          refObjModel.additionalProperties = false;
        } else {
          // Since Swagger allows "excess properties" (to use a TypeScript term) by default
          refObjModel.additionalProperties = true;
        }
        model = refObjModel;
      } else if (referenceType.dataType === 'refAlias') {
        const refType = {
          dataType: 'refAlias',
          type: {
            ...this.buildProperty(referenceType.type),
            validators: referenceType.validators,
            default: referenceType.default,
          },
        };
        model = refType;
      } else {
        model = (0, runtime_1.assertNever)(referenceType);
      }
      models[name] = model;
    });
    return models;
  }
  pathTransformer(path) {
    return (0, pathUtils_1.convertBracesPathParams)(path);
  }
  buildContext() {
    const authenticationModule = this.options.authenticationModule ? this.getRelativeImportPath(this.options.authenticationModule) : undefined;
    const iocModule = this.options.iocModule ? this.getRelativeImportPath(this.options.iocModule) : undefined;
    // Left in for backwards compatibility, previously if we're working locally then tsoa runtime code wasn't an importable module but now it is.
    const canImportByAlias = true;
    const normalisedBasePath = (0, pathUtils_1.normalisePath)(this.options.basePath, '/');
    return {
      authenticationModule,
      basePath: normalisedBasePath,
      canImportByAlias,
      controllers: this.metadata.controllers.map(controller => {
        const normalisedControllerPath = this.pathTransformer((0, pathUtils_1.normalisePath)(controller.path, '/'));
        return {
          actions: controller.methods.map(method => {
            const parameterObjs = {};
            method.parameters.forEach(parameter => {
              parameterObjs[parameter.parameterName] = this.buildParameterSchema(parameter);
            });
            const normalisedMethodPath = this.pathTransformer((0, pathUtils_1.normalisePath)(method.path, '/'));
            const normalisedFullPath = (0, pathUtils_1.normalisePath)(`${normalisedBasePath}${normalisedControllerPath}${normalisedMethodPath}`, '/', '', false);
            const uploadFileParameter = method.parameters.find(parameter => parameter.type.dataType === 'file');
            const uploadFilesParameter = method.parameters.find(parameter => parameter.type.dataType === 'array' && parameter.type.elementType.dataType === 'file');
            return {
              fullPath: normalisedFullPath,
              method: method.method.toLowerCase(),
              name: method.name,
              parameters: parameterObjs,
              path: normalisedMethodPath,
              uploadFile: !!uploadFileParameter,
              uploadFileName: uploadFileParameter?.name,
              uploadFiles: !!uploadFilesParameter,
              uploadFilesName: uploadFilesParameter?.name,
              security: method.security,
              successStatus: method.successStatus ? method.successStatus : 'undefined',
            };
          }),
          modulePath: this.getRelativeImportPath(controller.location),
          name: controller.name,
          path: normalisedControllerPath,
        };
      }),
      environment: process.env,
      iocModule,
      minimalSwaggerConfig: { noImplicitAdditionalProperties: this.options.noImplicitAdditionalProperties },
      models: this.buildModels(),
      useFileUploads: this.metadata.controllers.some(controller =>
        controller.methods.some(
          method =>
            !!method.parameters.find(parameter => {
              if (parameter.type.dataType === 'file') {
                return true;
              } else if (parameter.type.dataType === 'array' && parameter.type.elementType.dataType === 'file') {
                return true;
              }
              return false;
            }),
        ),
      ),
      multerOpts: {
        limits: {
          fileSize: 8388608, // 8mb
        },
        ...this.options.multerOpts,
      },
      useSecurity: this.metadata.controllers.some(controller => controller.methods.some(method => !!method.security.length)),
      esm: this.options.esm,
    };
  }
  getRelativeImportPath(fileLocation) {
    const currentExt = path.extname(fileLocation);
    let newExtension = '';
    if (this.options.esm) {
      switch (currentExt) {
        case '.ts':
        default:
          newExtension = '.js';
          break;
        case '.mts':
          newExtension = '.mjs';
          break;
        case '.cts':
          newExtension = '.cjs';
          break;
      }
    }
    fileLocation = fileLocation.replace(/\.(ts|mts|cts)$/, ''); // no ts extension in import
    return `./${path.relative(this.options.routesDir, fileLocation).replace(/\\/g, '/')}${newExtension}`;
  }
  buildPropertySchema(source) {
    const propertySchema = this.buildProperty(source.type);
    propertySchema.default = source.default;
    propertySchema.required = source.required ? true : undefined;
    if (Object.keys(source.validators).length > 0) {
      propertySchema.validators = source.validators;
    }
    return propertySchema;
  }
  buildParameterSchema(source) {
    const property = this.buildProperty(source.type);
    const parameter = {
      default: source.default,
      in: source.in,
      name: source.name,
      required: source.required ? true : undefined,
    };
    const parameterSchema = Object.assign(parameter, property);
    if (Object.keys(source.validators).length > 0) {
      parameterSchema.validators = source.validators;
    }
    return parameterSchema;
  }
  buildProperty(type) {
    const schema = {
      dataType: type.dataType,
    };
    if ((0, internalTypeGuards_1.isRefType)(type)) {
      schema.dataType = undefined;
      schema.ref = type.refName;
    }
    if (type.dataType === 'array') {
      const arrayType = type;
      if ((0, internalTypeGuards_1.isRefType)(arrayType.elementType)) {
        schema.array = {
          dataType: arrayType.elementType.dataType,
          ref: arrayType.elementType.refName,
        };
      } else {
        schema.array = this.buildProperty(arrayType.elementType);
      }
    }
    if (type.dataType === 'enum') {
      schema.enums = type.enums;
    }
    if (type.dataType === 'union' || type.dataType === 'intersection') {
      schema.subSchemas = type.types.map(type => this.buildProperty(type));
    }
    if (type.dataType === 'nestedObjectLiteral') {
      const objLiteral = type;
      schema.nestedProperties = objLiteral.properties.reduce((acc, prop) => {
        return { ...acc, [prop.name]: this.buildPropertySchema(prop) };
      }, {});
      schema.additionalProperties = objLiteral.additionalProperties && this.buildProperty(objLiteral.additionalProperties);
    }
    return schema;
  }
  async shouldWriteFile(fileName, content) {
    if (this.options.noWriteIfUnchanged) {
      if (await (0, fs_1.fsExists)(fileName)) {
        const existingContent = (await (0, fs_1.fsReadFile)(fileName)).toString();
        return content !== existingContent;
      }
    }
    return true;
  }
}
exports.AbstractRouteGenerator = AbstractRouteGenerator;
//# sourceMappingURL=routeGenerator.js.map
