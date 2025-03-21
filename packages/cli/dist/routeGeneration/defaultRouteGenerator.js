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
exports.DefaultRouteGenerator = void 0;
const fs = __importStar(require('fs'));
const handlebars = __importStar(require('handlebars'));
const path = __importStar(require('path'));
const runtime_1 = require('@tsoa/runtime');
const fs_1 = require('../utils/fs');
const pathUtils_1 = require('../utils/pathUtils');
const routeGenerator_1 = require('./routeGenerator');
class DefaultRouteGenerator extends routeGenerator_1.AbstractRouteGenerator {
  constructor(metadata, options) {
    super(metadata, options);
    this.pathTransformerFn = pathUtils_1.convertBracesPathParams;
    switch (options.middleware) {
      case 'express':
        this.template = path.join(__dirname, '..', 'routeGeneration/templates/express.hbs');
        break;
      case 'hapi':
        this.template = path.join(__dirname, '..', 'routeGeneration/templates/hapi.hbs');
        this.pathTransformerFn = path => path;
        break;
      case 'koa':
        this.template = path.join(__dirname, '..', 'routeGeneration/templates/koa.hbs');
        break;
      default:
        this.template = path.join(__dirname, '..', 'routeGeneration/templates/express.hbs');
    }
    if (options.middlewareTemplate) {
      this.template = options.middlewareTemplate;
    }
  }
  async GenerateCustomRoutes() {
    const data = await (0, fs_1.fsReadFile)(path.join(this.template));
    const file = data.toString();
    return await this.GenerateRoutes(file);
  }
  async GenerateRoutes(middlewareTemplate) {
    const allowedExtensions = this.options.esm ? ['.ts', '.mts', '.cts'] : ['.ts'];
    if (!fs.lstatSync(this.options.routesDir).isDirectory()) {
      throw new Error(`routesDir should be a directory`);
    } else if (this.options.routesFileName !== undefined) {
      const ext = path.extname(this.options.routesFileName);
      if (!allowedExtensions.includes(ext)) {
        throw new Error(`routesFileName should be a valid typescript file.`);
      }
    }
    const fileName = `${this.options.routesDir}/${this.options.routesFileName || 'routes.ts'}`;
    const content = this.buildContent(middlewareTemplate);
    if (await this.shouldWriteFile(fileName, content)) {
      await (0, fs_1.fsWriteFile)(fileName, content);
    }
  }
  pathTransformer(path) {
    return this.pathTransformerFn(path);
  }
  buildContent(middlewareTemplate) {
    handlebars.registerHelper('json', context => {
      return JSON.stringify(context);
    });
    const additionalPropsHelper = additionalProperties => {
      if (additionalProperties) {
        // Then the model for this type explicitly allows additional properties and thus we should assign that
        return JSON.stringify(additionalProperties);
      } else if (this.options.noImplicitAdditionalProperties === 'silently-remove-extras') {
        return JSON.stringify(false);
      } else if (this.options.noImplicitAdditionalProperties === 'throw-on-extras') {
        return JSON.stringify(false);
      } else if (this.options.noImplicitAdditionalProperties === 'ignore') {
        return JSON.stringify(true);
      } else {
        return (0, runtime_1.assertNever)(this.options.noImplicitAdditionalProperties);
      }
    };
    handlebars.registerHelper('additionalPropsHelper', additionalPropsHelper);
    const routesTemplate = handlebars.compile(middlewareTemplate, { noEscape: true });
    return routesTemplate(this.buildContext());
  }
}
exports.DefaultRouteGenerator = DefaultRouteGenerator;
//# sourceMappingURL=defaultRouteGenerator.js.map
