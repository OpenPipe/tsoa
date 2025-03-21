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
exports.generateSpec = exports.getSwaggerOutputPath = void 0;
const YAML = __importStar(require('yamljs'));
const metadataGenerator_1 = require('../metadataGeneration/metadataGenerator');
const specGenerator2_1 = require('../swagger/specGenerator2');
const specGenerator3_1 = require('../swagger/specGenerator3');
const fs_1 = require('../utils/fs');
const getSwaggerOutputPath = swaggerConfig => {
  const ext = swaggerConfig.yaml ? 'yaml' : 'json';
  const specFileBaseName = swaggerConfig.specFileBaseName || 'swagger';
  return `${swaggerConfig.outputDirectory}/${specFileBaseName}.${ext}`;
};
exports.getSwaggerOutputPath = getSwaggerOutputPath;
const generateSpec = async (
  swaggerConfig,
  compilerOptions,
  ignorePaths,
  /**
   * pass in cached metadata returned in a previous step to speed things up
   */
  metadata,
  defaultNumberType,
) => {
  if (!metadata) {
    metadata = new metadataGenerator_1.MetadataGenerator(
      swaggerConfig.entryFile,
      compilerOptions,
      ignorePaths,
      swaggerConfig.controllerPathGlobs,
      swaggerConfig.rootSecurity,
      defaultNumberType,
    ).Generate();
  }
  let spec;
  if (swaggerConfig.specVersion && swaggerConfig.specVersion === 3) {
    spec = new specGenerator3_1.SpecGenerator3(metadata, swaggerConfig).GetSpec();
  } else {
    spec = new specGenerator2_1.SpecGenerator2(metadata, swaggerConfig).GetSpec();
  }
  await (0, fs_1.fsMkDir)(swaggerConfig.outputDirectory, { recursive: true });
  let data = JSON.stringify(spec, null, '\t');
  if (swaggerConfig.yaml) {
    data = YAML.stringify(JSON.parse(data), 10);
  }
  const outputPath = (0, exports.getSwaggerOutputPath)(swaggerConfig);
  await (0, fs_1.fsWriteFile)(outputPath, data, { encoding: 'utf8' });
  return metadata;
};
exports.generateSpec = generateSpec;
//# sourceMappingURL=generate-spec.js.map
