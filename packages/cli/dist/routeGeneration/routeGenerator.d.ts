/// <reference types="node" />
import { ExtendedRoutesConfig } from '../cli';
import { Tsoa, TsoaRoute } from '@tsoa/runtime';
export declare abstract class AbstractRouteGenerator<Config extends ExtendedRoutesConfig> {
  protected readonly metadata: Tsoa.Metadata;
  protected readonly options: Config;
  constructor(metadata: Tsoa.Metadata, options: Config);
  /**
   * This is the entrypoint for a generator to create a custom set of routes
   */
  abstract GenerateCustomRoutes(): Promise<void>;
  buildModels(): TsoaRoute.Models;
  protected pathTransformer(path: string): string;
  protected buildContext(): {
    authenticationModule: string | undefined;
    basePath: string;
    canImportByAlias: boolean;
    controllers: {
      actions: {
        fullPath: string;
        method: string;
        name: string;
        parameters: {
          [name: string]: TsoaRoute.ParameterSchema;
        };
        path: string;
        uploadFile: boolean;
        uploadFileName: string | undefined;
        uploadFiles: boolean;
        uploadFilesName: string | undefined;
        security: Tsoa.Security[];
        successStatus: string | number;
      }[];
      modulePath: string;
      name: string;
      path: string;
    }[];
    environment: NodeJS.ProcessEnv;
    iocModule: string | undefined;
    minimalSwaggerConfig: {
      noImplicitAdditionalProperties: 'ignore' | 'throw-on-extras' | 'silently-remove-extras';
    };
    models: TsoaRoute.Models;
    useFileUploads: boolean;
    multerOpts: {
      storage?: import('multer').StorageEngine | undefined;
      dest?: string | undefined;
      limits: {
        fieldNameSize?: number | undefined;
        fieldSize?: number | undefined;
        fields?: number | undefined;
        fileSize?: number | undefined;
        files?: number | undefined;
        parts?: number | undefined;
        headerPairs?: number | undefined;
      };
      preservePath?: boolean | undefined;
      fileFilter?:
        | ((
            req: import('express').Request<import('express-serve-static-core').ParamsDictionary, any, any, import('qs').ParsedQs, Record<string, any>>,
            file: Express.Multer.File,
            callback: import('multer').FileFilterCallback,
          ) => void)
        | undefined;
    };
    useSecurity: boolean;
    esm: boolean | undefined;
  };
  protected getRelativeImportPath(fileLocation: string): string;
  protected buildPropertySchema(source: Tsoa.Property): TsoaRoute.PropertySchema;
  protected buildParameterSchema(source: Tsoa.Parameter): TsoaRoute.ParameterSchema;
  protected buildProperty(type: Tsoa.Type): TsoaRoute.PropertySchema;
  protected shouldWriteFile(fileName: string, content: string): Promise<boolean>;
}
