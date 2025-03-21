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
exports.TypeResolver = void 0;
const runtime_1 = require('@tsoa/runtime');
const ts = __importStar(require('typescript'));
const jsonUtils_1 = require('../utils/jsonUtils');
const decoratorUtils_1 = require('./../utils/decoratorUtils');
const jsDocUtils_1 = require('./../utils/jsDocUtils');
const validatorUtils_1 = require('./../utils/validatorUtils');
const exceptions_1 = require('./exceptions');
const extension_1 = require('./extension');
const initializer_value_1 = require('./initializer-value');
const localReferenceTypeCache = {};
const inProgressTypes = {};
class TypeResolver {
  constructor(typeNode, current, parentNode, context = {}, referencer) {
    this.typeNode = typeNode;
    this.current = current;
    this.parentNode = parentNode;
    this.context = context;
    this.referencer = referencer;
    this.attemptToResolveKindToPrimitive = syntaxKind => {
      if (syntaxKind === ts.SyntaxKind.NumberKeyword) {
        return {
          foundMatch: true,
          resolvedType: 'number',
        };
      } else if (syntaxKind === ts.SyntaxKind.StringKeyword) {
        return {
          foundMatch: true,
          resolvedType: 'string',
        };
      } else if (syntaxKind === ts.SyntaxKind.BooleanKeyword) {
        return {
          foundMatch: true,
          resolvedType: 'boolean',
        };
      } else if (syntaxKind === ts.SyntaxKind.VoidKeyword) {
        return {
          foundMatch: true,
          resolvedType: 'void',
        };
      } else if (syntaxKind === ts.SyntaxKind.UndefinedKeyword) {
        return {
          foundMatch: true,
          resolvedType: 'undefined',
        };
      } else {
        return {
          foundMatch: false,
        };
      }
    };
  }
  static clearCache() {
    Object.keys(localReferenceTypeCache).forEach(key => {
      delete localReferenceTypeCache[key];
    });
    Object.keys(inProgressTypes).forEach(key => {
      delete inProgressTypes[key];
    });
  }
  resolve() {
    const primitiveType = this.getPrimitiveType(this.typeNode, this.parentNode);
    if (primitiveType) {
      return primitiveType;
    }
    if (this.typeNode.kind === ts.SyntaxKind.NullKeyword) {
      const enumType = {
        dataType: 'enum',
        enums: [null],
      };
      return enumType;
    }
    if (this.typeNode.kind === ts.SyntaxKind.UndefinedKeyword) {
      const undefinedType = {
        dataType: 'undefined',
      };
      return undefinedType;
    }
    if (ts.isArrayTypeNode(this.typeNode)) {
      const arrayMetaType = {
        dataType: 'array',
        elementType: new TypeResolver(this.typeNode.elementType, this.current, this.parentNode, this.context).resolve(),
      };
      return arrayMetaType;
    }
    if (ts.isUnionTypeNode(this.typeNode)) {
      const types = this.typeNode.types.map(type => {
        return new TypeResolver(type, this.current, this.parentNode, this.context).resolve();
      });
      const unionMetaType = {
        dataType: 'union',
        types,
      };
      return unionMetaType;
    }
    if (ts.isIntersectionTypeNode(this.typeNode)) {
      const types = this.typeNode.types.map(type => {
        return new TypeResolver(type, this.current, this.parentNode, this.context).resolve();
      });
      const intersectionMetaType = {
        dataType: 'intersection',
        types,
      };
      return intersectionMetaType;
    }
    if (this.typeNode.kind === ts.SyntaxKind.AnyKeyword || this.typeNode.kind === ts.SyntaxKind.UnknownKeyword) {
      const literallyAny = {
        dataType: 'any',
      };
      return literallyAny;
    }
    if (ts.isLiteralTypeNode(this.typeNode)) {
      const enumType = {
        dataType: 'enum',
        enums: [this.getLiteralValue(this.typeNode)],
      };
      return enumType;
    }
    if (ts.isTypeLiteralNode(this.typeNode)) {
      const properties = this.typeNode.members.filter(ts.isPropertySignature).reduce((res, propertySignature) => {
        const type = new TypeResolver(propertySignature.type, this.current, propertySignature, this.context).resolve();
        const def = TypeResolver.getDefault(propertySignature);
        const property = {
          example: this.getNodeExample(propertySignature),
          default: def,
          description: this.getNodeDescription(propertySignature),
          format: this.getNodeFormat(propertySignature),
          name: propertySignature.name.text,
          required: !propertySignature.questionToken,
          type,
          validators: (0, validatorUtils_1.getPropertyValidators)(propertySignature) || {},
          deprecated: (0, jsDocUtils_1.isExistJSDocTag)(propertySignature, tag => tag.tagName.text === 'deprecated'),
          extensions: this.getNodeExtension(propertySignature),
        };
        return [property, ...res];
      }, []);
      const indexMember = this.typeNode.members.find(member => ts.isIndexSignatureDeclaration(member));
      let additionalType;
      if (indexMember) {
        const indexSignatureDeclaration = indexMember;
        const indexType = new TypeResolver(indexSignatureDeclaration.parameters[0].type, this.current, this.parentNode, this.context).resolve();
        if (indexType.dataType !== 'string') {
          throw new exceptions_1.GenerateMetadataError(`Only string indexers are supported.`, this.typeNode);
        }
        additionalType = new TypeResolver(indexSignatureDeclaration.type, this.current, this.parentNode, this.context).resolve();
      }
      const objLiteral = {
        additionalProperties: indexMember && additionalType,
        dataType: 'nestedObjectLiteral',
        properties,
      };
      return objLiteral;
    }
    if (this.typeNode.kind === ts.SyntaxKind.ObjectKeyword) {
      return { dataType: 'object' };
    }
    if (ts.isMappedTypeNode(this.typeNode)) {
      const mappedTypeNode = this.typeNode;
      const getOneOrigDeclaration = prop => {
        if (prop.declarations) {
          return prop.declarations[0];
        }
        const syntheticOrigin = prop.links?.syntheticOrigin;
        if (syntheticOrigin && syntheticOrigin.name === prop.name) {
          //Otherwise losts jsDoc like in intellisense
          return syntheticOrigin.declarations?.[0];
        }
        return undefined;
      };
      const isIgnored = prop => {
        const declaration = getOneOrigDeclaration(prop);
        return (
          declaration !== undefined &&
          ((0, jsDocUtils_1.getJSDocTagNames)(declaration).some(tag => tag === 'ignore') ||
            (!ts.isPropertyDeclaration(declaration) && !ts.isPropertySignature(declaration) && !ts.isParameter(declaration)))
        );
      };
      const calcMappedType = type => {
        if (type.flags & ts.TypeFlags.Union) {
          //Intersections are not interesting somehow...
          const types = type.types;
          const resolvedTypes = types.map(calcMappedType);
          return {
            dataType: 'union',
            types: resolvedTypes,
          };
        } else if (type.flags & ts.TypeFlags.Undefined) {
          return {
            dataType: 'undefined',
          };
        } else if (type.flags & ts.TypeFlags.Null) {
          return {
            dataType: 'enum',
            enums: [null],
          };
        } else if (type.flags & ts.TypeFlags.Object) {
          const typeProperties = type.getProperties();
          const properties = typeProperties
            // Ignore methods, getter, setter and @ignored props
            .filter(property => isIgnored(property) === false)
            // Transform to property
            .map(property => {
              const propertyType = this.current.typeChecker.getTypeOfSymbolAtLocation(property, this.typeNode);
              const typeNode = this.current.typeChecker.typeToTypeNode(propertyType, undefined, ts.NodeBuilderFlags.NoTruncation);
              const parent = getOneOrigDeclaration(property); //If there are more declarations, we need to get one of them, from where we want to recognize jsDoc
              const type = new TypeResolver(typeNode, this.current, parent, this.context, propertyType).resolve();
              const required = !(property.flags & ts.SymbolFlags.Optional);
              const comments = property.getDocumentationComment(this.current.typeChecker);
              const description = comments.length ? ts.displayPartsToString(comments) : undefined;
              const initializer = parent?.initializer;
              const def = initializer ? (0, initializer_value_1.getInitializerValue)(initializer, this.current.typeChecker) : parent ? TypeResolver.getDefault(parent) : undefined;
              // Push property
              return {
                name: property.getName(),
                required,
                deprecated: parent
                  ? (0, jsDocUtils_1.isExistJSDocTag)(parent, tag => tag.tagName.text === 'deprecated') || (0, decoratorUtils_1.isDecorator)(parent, identifier => identifier.text === 'Deprecated')
                  : false,
                type,
                default: def,
                // validators are disjunct via types, so it is now OK.
                // if a type not changes while mapping, we need validators
                // if a type changes, then the validators will be not relevant
                validators: (parent ? (0, validatorUtils_1.getPropertyValidators)(parent) : {}) || {},
                description,
                format: parent ? this.getNodeFormat(parent) : undefined,
                example: parent ? this.getNodeExample(parent) : undefined,
                extensions: parent ? this.getNodeExtension(parent) : undefined,
              };
            });
          const objectLiteral = {
            dataType: 'nestedObjectLiteral',
            properties,
          };
          const indexInfos = this.current.typeChecker.getIndexInfosOfType(type);
          const indexTypes = indexInfos.map(indexInfo => {
            const typeNode = this.current.typeChecker.typeToTypeNode(indexInfo.type, undefined, ts.NodeBuilderFlags.NoTruncation);
            const type = new TypeResolver(typeNode, this.current, mappedTypeNode, this.context, indexInfo.type).resolve();
            return type;
          });
          if (indexTypes.length) {
            if (indexTypes.length === 1) {
              objectLiteral.additionalProperties = indexTypes[0];
            } else {
              // { [k: string]: string; } & { [k: number]: number; }
              // A | B is sometimes A type or B type, sometimes optionally accepts both A & B members.
              // Most people & TSOA thinks that A | B can be only A or only B.
              // So we can accept this merge
              //Every additional property key assumed as string
              objectLiteral.additionalProperties = {
                dataType: 'union',
                types: indexTypes,
              };
            }
          }
          return objectLiteral;
        } else {
          // Known issues & easy to implement: Partial<string>, Partial<never>, ... But I think a programmer not writes types like this
          throw new exceptions_1.GenerateMetadataError(`Unhandled mapped type has found, flags: ${type.flags}`, this.typeNode);
        }
      };
      const referencer = this.getReferencer();
      const result = calcMappedType(referencer);
      return result;
    }
    if (ts.isConditionalTypeNode(this.typeNode)) {
      const referencer = this.getReferencer();
      const resolvedNode = this.current.typeChecker.typeToTypeNode(referencer, undefined, ts.NodeBuilderFlags.NoTruncation);
      return new TypeResolver(resolvedNode, this.current, this.typeNode, this.context, referencer).resolve();
    }
    // keyof
    if (ts.isTypeOperatorNode(this.typeNode) && this.typeNode.operator === ts.SyntaxKind.KeyOfKeyword) {
      const type = this.current.typeChecker.getTypeFromTypeNode(this.typeNode);
      if (type.isIndexType()) {
        // in case of generic: keyof T. Not handles all possible cases
        const symbol = type.type.getSymbol();
        if (symbol && symbol.getFlags() & ts.TypeFlags.TypeParameter) {
          const typeName = symbol.getEscapedName();
          if (typeof typeName !== 'string') {
            throw new exceptions_1.GenerateMetadataError(`typeName is not string, but ${typeof typeName}`, this.typeNode);
          }
          if (this.context[typeName]) {
            const subResult = new TypeResolver(this.context[typeName].type, this.current, this.parentNode, this.context).resolve();
            if (subResult.dataType === 'any') {
              return {
                dataType: 'union',
                types: [{ dataType: 'string' }, { dataType: 'double' }],
              };
            }
            const properties = subResult.properties?.map(v => v.name);
            if (properties) {
              return {
                dataType: 'enum',
                enums: properties,
              };
            } else {
              throw new exceptions_1.GenerateMetadataError(`TypeOperator 'keyof' on node which have no properties`, this.context[typeName].type);
            }
          }
        }
      } else if (type.isUnion()) {
        const literals = type.types.filter(t => t.isLiteral());
        const literalValues = [];
        for (const literal of literals) {
          if (typeof literal.value == 'number' || typeof literal.value == 'string') {
            literalValues.push(literal.value);
          } else {
            throw new exceptions_1.GenerateMetadataError(`Not handled key Type, maybe ts.PseudoBigInt ${this.current.typeChecker.typeToString(literal)}`, this.typeNode);
          }
        }
        if (
          !literals.length &&
          type.types.length === 3 &&
          type.types.some(t => t.flags === ts.TypeFlags.String) &&
          type.types.some(t => t.flags === ts.TypeFlags.Number) &&
          type.types.some(t => t.flags === ts.TypeFlags.ESSymbol)
        ) {
          //keyof any
          return {
            dataType: 'union',
            types: [{ dataType: 'string' }, { dataType: 'double' }],
          };
        }
        if (!literals.length && type.types.length === 2 && type.types.some(t => t.flags === ts.TypeFlags.Number) && type.types.some(t => t.flags === ts.TypeFlags.String)) {
          return {
            dataType: 'union',
            types: [{ dataType: 'string' }, { dataType: 'double' }],
          };
        }
        // Warn on nonsense (`number`, `typeof Symbol.iterator`)
        if (type.types.find(t => !t.isLiteral()) !== undefined) {
          const problems = type.types.filter(t => !t.isLiteral()).map(t => this.current.typeChecker.typeToString(t));
          console.warn(new exceptions_1.GenerateMetaDataWarning(`Skipped non-literal type(s) ${problems.join(', ')}`, this.typeNode).toString());
        }
        const stringMembers = literalValues.filter(v => typeof v == 'string');
        const numberMembers = literalValues.filter(v => typeof v == 'number');
        if (stringMembers.length && numberMembers.length) {
          return {
            dataType: 'union',
            types: [
              { dataType: 'enum', enums: stringMembers },
              { dataType: 'enum', enums: numberMembers },
            ],
          };
        }
        return {
          dataType: 'enum',
          enums: literalValues,
        };
      } else if (type.isLiteral()) {
        if (typeof type.value == 'number' || typeof type.value == 'string') {
          return {
            dataType: 'enum',
            enums: [type.value],
          };
        } else {
          throw new exceptions_1.GenerateMetadataError(`Not handled indexType, maybe ts.PseudoBigInt ${this.current.typeChecker.typeToString(type)}`, this.typeNode);
        }
      } else if ((type.getFlags() & ts.TypeFlags.Never) !== 0) {
        throw new exceptions_1.GenerateMetadataError(`TypeOperator 'keyof' on node produced a never type`, this.typeNode);
      } else if ((type.getFlags() & ts.TypeFlags.TemplateLiteral) !== 0) {
        //Now assumes template literals as string
        console.warn(new exceptions_1.GenerateMetaDataWarning(`Template literals are assumed as strings`, this.typeNode).toString());
        return {
          dataType: 'string',
        };
      } else if ((type.getFlags() & ts.TypeFlags.Number) !== 0) {
        return {
          dataType: 'double',
        };
      }
      const indexedTypeName = this.current.typeChecker.typeToString(this.current.typeChecker.getTypeFromTypeNode(this.typeNode.type));
      throw new exceptions_1.GenerateMetadataError(`Could not determine the keys on ${indexedTypeName}`, this.typeNode);
    }
    // Handle `readonly` arrays
    if (ts.isTypeOperatorNode(this.typeNode) && this.typeNode.operator === ts.SyntaxKind.ReadonlyKeyword) {
      return new TypeResolver(this.typeNode.type, this.current, this.typeNode, this.context, this.referencer).resolve();
    }
    // Indexed by keyword
    if (ts.isIndexedAccessTypeNode(this.typeNode) && (this.typeNode.indexType.kind === ts.SyntaxKind.NumberKeyword || this.typeNode.indexType.kind === ts.SyntaxKind.StringKeyword)) {
      const numberIndexType = this.typeNode.indexType.kind === ts.SyntaxKind.NumberKeyword;
      const objectType = this.current.typeChecker.getTypeFromTypeNode(this.typeNode.objectType);
      const type = numberIndexType ? objectType.getNumberIndexType() : objectType.getStringIndexType();
      if (type === undefined) {
        throw new exceptions_1.GenerateMetadataError(`Could not determine ${numberIndexType ? 'number' : 'string'} index on ${this.current.typeChecker.typeToString(objectType)}`, this.typeNode);
      }
      return new TypeResolver(this.current.typeChecker.typeToTypeNode(type, this.typeNode.objectType, ts.NodeBuilderFlags.NoTruncation), this.current, this.typeNode, this.context).resolve();
    }
    // Indexed by literal
    if (
      ts.isIndexedAccessTypeNode(this.typeNode) &&
      ts.isLiteralTypeNode(this.typeNode.indexType) &&
      (ts.isStringLiteral(this.typeNode.indexType.literal) || ts.isNumericLiteral(this.typeNode.indexType.literal))
    ) {
      const hasType = node => node !== undefined && Object.prototype.hasOwnProperty.call(node, 'type');
      const symbol = this.current.typeChecker.getPropertyOfType(this.current.typeChecker.getTypeFromTypeNode(this.typeNode.objectType), this.typeNode.indexType.literal.text);
      if (symbol === undefined) {
        throw new exceptions_1.GenerateMetadataError(
          `Could not determine the keys on ${this.current.typeChecker.typeToString(this.current.typeChecker.getTypeFromTypeNode(this.typeNode.objectType))}`,
          this.typeNode,
        );
      }
      if (hasType(symbol.valueDeclaration) && symbol.valueDeclaration.type) {
        return new TypeResolver(symbol.valueDeclaration.type, this.current, this.typeNode, this.context).resolve();
      }
      const declaration = this.current.typeChecker.getTypeOfSymbolAtLocation(symbol, this.typeNode.objectType);
      try {
        return new TypeResolver(this.current.typeChecker.typeToTypeNode(declaration, this.typeNode.objectType, ts.NodeBuilderFlags.NoTruncation), this.current, this.typeNode, this.context).resolve();
      } catch {
        throw new exceptions_1.GenerateMetadataError(
          `Could not determine the keys on ${this.current.typeChecker.typeToString(
            this.current.typeChecker.getTypeFromTypeNode(this.current.typeChecker.typeToTypeNode(declaration, undefined, ts.NodeBuilderFlags.NoTruncation)),
          )}`,
          this.typeNode,
        );
      }
    }
    // Indexed by keyof typeof value
    if (ts.isIndexedAccessTypeNode(this.typeNode) && ts.isTypeOperatorNode(this.typeNode.indexType) && this.typeNode.indexType.operator === ts.SyntaxKind.KeyOfKeyword) {
      const resolveParenthesis = node => (ts.isParenthesizedTypeNode(node) ? node.type : node);
      const objectType = resolveParenthesis(this.typeNode.objectType);
      const indexType = this.typeNode.indexType.type;
      const isSameTypeQuery = ts.isTypeQueryNode(objectType) && ts.isTypeQueryNode(indexType) && objectType.exprName.getText() === indexType.exprName.getText();
      const isSameTypeReference = ts.isTypeReferenceNode(objectType) && ts.isTypeReferenceNode(indexType) && objectType.typeName.getText() === indexType.typeName.getText();
      if (isSameTypeQuery || isSameTypeReference) {
        const type = this.getReferencer();
        const node = this.current.typeChecker.typeToTypeNode(type, undefined, ts.NodeBuilderFlags.InTypeAlias | ts.NodeBuilderFlags.NoTruncation);
        return new TypeResolver(node, this.current, this.typeNode, this.context, this.referencer).resolve();
      }
    }
    if (ts.isTemplateLiteralTypeNode(this.typeNode)) {
      const type = this.getReferencer();
      if (type.isUnion() && type.types.every(unionElementType => unionElementType.isStringLiteral())) {
        // `a${'c' | 'd'}b`
        const stringLiteralEnum = {
          dataType: 'enum',
          enums: type.types.map(stringLiteralType => stringLiteralType.value),
        };
        return stringLiteralEnum;
      } else {
        throw new exceptions_1.GenerateMetadataError(
          `Could not the type of ${this.current.typeChecker.typeToString(this.current.typeChecker.getTypeFromTypeNode(this.typeNode), this.typeNode)}`,
          this.typeNode,
        );
      }
    }
    if (ts.isParenthesizedTypeNode(this.typeNode)) {
      return new TypeResolver(this.typeNode.type, this.current, this.typeNode, this.context, this.referencer).resolve();
    }
    if (this.typeNode.kind !== ts.SyntaxKind.TypeReference) {
      throw new exceptions_1.GenerateMetadataError(`Unknown type: ${ts.SyntaxKind[this.typeNode.kind]}`, this.typeNode);
    }
    const typeReference = this.typeNode;
    if (typeReference.typeName.kind === ts.SyntaxKind.Identifier) {
      if (typeReference.typeName.text === 'Date') {
        return this.getDateType(this.parentNode);
      }
      if (typeReference.typeName.text === 'Buffer') {
        const bufferMetaType = { dataType: 'buffer' };
        return bufferMetaType;
      }
      if (typeReference.typeName.text === 'Readable') {
        const streamMetaType = { dataType: 'buffer' };
        return streamMetaType;
      }
      if (typeReference.typeName.text === 'Array' && typeReference.typeArguments && typeReference.typeArguments.length === 1) {
        const arrayMetaType = {
          dataType: 'array',
          elementType: new TypeResolver(typeReference.typeArguments[0], this.current, this.parentNode, this.context).resolve(),
        };
        return arrayMetaType;
      }
      if (typeReference.typeName.text === 'Promise' && typeReference.typeArguments && typeReference.typeArguments.length === 1) {
        return new TypeResolver(typeReference.typeArguments[0], this.current, this.parentNode, this.context).resolve();
      }
      if (typeReference.typeName.text === 'String') {
        const stringMetaType = { dataType: 'string' };
        return stringMetaType;
      }
      if (this.context[typeReference.typeName.text]) {
        return new TypeResolver(this.context[typeReference.typeName.text].type, this.current, this.parentNode, this.context).resolve();
      }
    }
    const referenceType = this.getReferenceType(typeReference);
    return referenceType;
  }
  getLiteralValue(typeNode) {
    let value;
    switch (typeNode.literal.kind) {
      case ts.SyntaxKind.TrueKeyword:
        value = true;
        break;
      case ts.SyntaxKind.FalseKeyword:
        value = false;
        break;
      case ts.SyntaxKind.StringLiteral:
        value = typeNode.literal.text;
        break;
      case ts.SyntaxKind.NumericLiteral:
        value = parseFloat(typeNode.literal.text);
        break;
      case ts.SyntaxKind.NullKeyword:
        value = null;
        break;
      default:
        if (Object.prototype.hasOwnProperty.call(typeNode.literal, 'text')) {
          value = typeNode.literal.text;
        } else {
          throw new exceptions_1.GenerateMetadataError(`Couldn't resolve literal node: ${typeNode.literal.getText()}`);
        }
    }
    return value;
  }
  getPrimitiveType(typeNode, parentNode) {
    const resolution = this.attemptToResolveKindToPrimitive(typeNode.kind);
    if (!resolution.foundMatch) {
      return;
    }
    const defaultNumberType = this.current.defaultNumberType;
    if (resolution.resolvedType === 'number') {
      if (!parentNode) {
        return { dataType: defaultNumberType };
      }
      const tags = (0, jsDocUtils_1.getJSDocTagNames)(parentNode).filter(name => {
        return ['isInt', 'isLong', 'isFloat', 'isDouble'].some(m => m === name);
      });
      if (tags.length === 0) {
        return { dataType: defaultNumberType };
      }
      switch (tags[0]) {
        case 'isInt':
          return { dataType: 'integer' };
        case 'isLong':
          return { dataType: 'long' };
        case 'isFloat':
          return { dataType: 'float' };
        case 'isDouble':
          return { dataType: 'double' };
        default:
          return { dataType: defaultNumberType };
      }
    } else if (resolution.resolvedType === 'string') {
      return {
        dataType: 'string',
      };
    } else if (resolution.resolvedType === 'boolean') {
      return {
        dataType: 'boolean',
      };
    } else if (resolution.resolvedType === 'void') {
      return {
        dataType: 'void',
      };
    } else if (resolution.resolvedType === 'undefined') {
      return {
        dataType: 'undefined',
      };
    } else {
      return (0, runtime_1.assertNever)(resolution.resolvedType);
    }
  }
  getDateType(parentNode) {
    if (!parentNode) {
      return { dataType: 'datetime' };
    }
    const tags = (0, jsDocUtils_1.getJSDocTagNames)(parentNode).filter(name => {
      return ['isDate', 'isDateTime'].some(m => m === name);
    });
    if (tags.length === 0) {
      return { dataType: 'datetime' };
    }
    switch (tags[0]) {
      case 'isDate':
        return { dataType: 'date' };
      case 'isDateTime':
        return { dataType: 'datetime' };
      default:
        return { dataType: 'datetime' };
    }
  }
  getDesignatedModels(nodes, typeName) {
    /**
     * Model is marked with '@tsoaModel', indicating that it should be the 'canonical' model used
     */
    const designatedNodes = nodes.filter(enumNode => {
      return (0, jsDocUtils_1.isExistJSDocTag)(enumNode, tag => tag.tagName.text === 'tsoaModel');
    });
    if (designatedNodes.length > 0) {
      if (designatedNodes.length > 1) {
        throw new exceptions_1.GenerateMetadataError(`Multiple models for ${typeName} marked with '@tsoaModel'; '@tsoaModel' should only be applied to one model.`);
      }
      return designatedNodes;
    }
    return nodes;
  }
  hasFlag(type, flag) {
    return (type.flags & flag) === flag;
  }
  getEnumerateType(enumDeclaration, enumName) {
    const isNotUndefined = item => {
      return item === undefined ? false : true;
    };
    const enums = enumDeclaration.members.map(e => this.current.typeChecker.getConstantValue(e)).filter(isNotUndefined);
    const enumVarnames = enumDeclaration.members.map(e => e.name.getText()).filter(isNotUndefined);
    return {
      dataType: 'refEnum',
      description: this.getNodeDescription(enumDeclaration),
      enums,
      enumVarnames,
      refName: enumName,
      deprecated: (0, jsDocUtils_1.isExistJSDocTag)(enumDeclaration, tag => tag.tagName.text === 'deprecated'),
    };
  }
  getReferencer() {
    if (this.referencer) {
      return this.referencer;
    }
    if (this.typeNode.pos !== -1) {
      return this.current.typeChecker.getTypeFromTypeNode(this.typeNode);
    }
    throw new exceptions_1.GenerateMetadataError(`Can not succeeded to calculate referencer type.`, this.typeNode);
  }
  static typeReferenceToEntityName(node) {
    let type;
    if (ts.isTypeReferenceNode(node)) {
      type = node.typeName;
    } else if (ts.isExpressionWithTypeArguments(node)) {
      type = node.expression;
    } else {
      throw new exceptions_1.GenerateMetadataError(`Can't resolve Reference type.`);
    }
    return type;
  }
  //Generates type name for type references
  calcRefTypeName(type) {
    const getEntityName = type => {
      if (ts.isIdentifier(type)) {
        return type.text;
      }
      return `${getEntityName(type.left)}.${type.right.text}`;
    };
    let name = getEntityName(type);
    if (this.context[name]) {
      //resolve name only interesting if entity is not qualifiedName
      name = this.context[name].name; //Not needed to check unicity, because generic parameters are checked previously
    } else {
      const declarations = this.getModelTypeDeclarations(type);
      //Two possible solutions for recognizing different types:
      // - Add declaration positions into type names (In an order).
      //    - It accepts multiple types with same name, if the code compiles, there would be no conflicts in the type names
      //    - Clear namespaces from type names.
      //    - Horrible changes can be in the routes.ts in case of teamwork,
      //        because source files have paths in the computer where data generation runs.
      // - Use fully namespaced names
      //    - Conflicts can be recognized because of the declarations
      //
      // The second was implemented, it not changes the usual type name formats.
      const oneDeclaration = declarations[0]; //Every declarations should be in the same namespace hierarchy
      const identifiers = name.split('.');
      if (ts.isEnumMember(oneDeclaration)) {
        name = identifiers.slice(identifiers.length - 2).join('.');
      } else {
        name = identifiers.slice(identifiers.length - 1).join('.');
      }
      let actNode = oneDeclaration.parent;
      let isFirst = true;
      while (!ts.isSourceFile(actNode)) {
        if (!(isFirst && ts.isEnumDeclaration(actNode)) && !ts.isModuleBlock(actNode)) {
          if (ts.isModuleDeclaration(actNode)) {
            const moduleName = actNode.name.text;
            name = `${moduleName}.${name}`;
          } else {
            throw new exceptions_1.GenerateMetadataError(`This node kind is unknown: ${actNode.kind}`, type);
          }
        }
        isFirst = false;
        actNode = actNode.parent;
      }
      const declarationPositions = declarations.map(declaration => ({
        fileName: declaration.getSourceFile().fileName,
        pos: declaration.pos,
      }));
      this.current.CheckModelUnicity(name, declarationPositions);
    }
    return name;
  }
  calcMemberJsDocProperties(arg) {
    const def = TypeResolver.getDefault(arg);
    const isDeprecated = (0, jsDocUtils_1.isExistJSDocTag)(arg, tag => tag.tagName.text === 'deprecated') || (0, decoratorUtils_1.isDecorator)(arg, identifier => identifier.text === 'Deprecated');
    const symbol = this.getSymbolAtLocation(arg.name);
    const comments = symbol ? symbol.getDocumentationComment(this.current.typeChecker) : [];
    const description = comments.length ? ts.displayPartsToString(comments) : undefined;
    const validators = (0, validatorUtils_1.getPropertyValidators)(arg);
    const format = this.getNodeFormat(arg);
    const example = this.getNodeExample(arg);
    const extensions = this.getNodeExtension(arg);
    const isIgnored = (0, jsDocUtils_1.getJSDocTagNames)(arg).some(tag => tag === 'ignore');
    const jsonObj = {
      default: def,
      description,
      validators: validators && Object.keys(validators).length ? validators : undefined,
      format,
      example: example !== undefined ? example : undefined,
      extensions: extensions.length ? extensions : undefined,
      deprecated: isDeprecated ? true : undefined,
      ignored: isIgnored ? true : undefined,
    };
    const keys = Object.keys(jsonObj);
    for (const key of keys) {
      if (jsonObj[key] === undefined) {
        delete jsonObj[key];
      }
    }
    if (Object.keys(jsonObj).length) {
      return JSON.stringify(jsonObj);
    }
    return '';
  }
  //Generates type name for type references
  calcTypeName(arg) {
    if (ts.isLiteralTypeNode(arg)) {
      const literalValue = this.getLiteralValue(arg);
      if (typeof literalValue == 'string') {
        return `'${literalValue}'`;
      }
      if (literalValue === null) {
        return 'null';
      }
      if (typeof literalValue === 'boolean') {
        return literalValue === true ? 'true' : 'false';
      }
      return `${literalValue}`;
    }
    const resolved = this.attemptToResolveKindToPrimitive(arg.kind);
    if (resolved.foundMatch) {
      return resolved.resolvedType;
    }
    if (ts.isTypeReferenceNode(arg) || ts.isExpressionWithTypeArguments(arg)) {
      return this.calcTypeReferenceTypeName(arg);
    } else if (ts.isTypeLiteralNode(arg)) {
      const members = arg.members.map(member => {
        if (ts.isPropertySignature(member)) {
          const name = member.name.text;
          const typeText = this.calcTypeName(member.type);
          return `"${name}"${member.questionToken ? '?' : ''}${this.calcMemberJsDocProperties(member)}: ${typeText}`;
        } else if (ts.isIndexSignatureDeclaration(member)) {
          const typeText = this.calcTypeName(member.type);
          if (member.parameters.length !== 1) {
            throw new exceptions_1.GenerateMetadataError(`Index signature parameters length != 1`, member);
          }
          const indexType = member.parameters[0];
          if (ts.isParameter(indexType)) {
            const indexName = indexType.name.text;
            const indexTypeText = this.calcTypeName(indexType.type);
            if (indexType.questionToken) {
              throw new exceptions_1.GenerateMetadataError(`Question token has found for an indexSignature declaration`, indexType);
            }
            return `["${indexName}": ${indexTypeText}]: ${typeText}`;
          } else {
            // now we can't reach this part of code
            throw new exceptions_1.GenerateMetadataError(`indexSignature declaration parameter kind is not SyntaxKind.Parameter`, indexType);
          }
        }
        throw new exceptions_1.GenerateMetadataError(`Unhandled member kind has found: ${member.kind}`, member);
      });
      return `{${members.join('; ')}}`;
    } else if (ts.isArrayTypeNode(arg)) {
      const typeName = this.calcTypeName(arg.elementType);
      return `${typeName}[]`;
    } else if (ts.isIntersectionTypeNode(arg)) {
      const memberTypeNames = arg.types.map(type => this.calcTypeName(type));
      return memberTypeNames.join(' & ');
    } else if (ts.isUnionTypeNode(arg)) {
      const memberTypeNames = arg.types.map(type => this.calcTypeName(type));
      return memberTypeNames.join(' | ');
    } else if (ts.isTypeOperatorNode(arg)) {
      const subTypeName = this.calcTypeName(arg.type);
      let operatorName;
      if (arg.operator === ts.SyntaxKind.KeyOfKeyword) {
        operatorName = 'keyof';
      } else if (arg.operator === ts.SyntaxKind.ReadonlyKeyword) {
        operatorName = 'readonly';
      } else {
        throw new exceptions_1.GenerateMetadataError(`Unknown keyword has found: ${arg.operator}`, arg);
      }
      return `${operatorName} ${subTypeName}`;
    } else if (ts.isTypeQueryNode(arg)) {
      const subTypeName = this.calcRefTypeName(arg.exprName);
      return `typeof ${subTypeName}`;
    } else if (ts.isIndexedAccessTypeNode(arg)) {
      const objectTypeName = this.calcTypeName(arg.objectType);
      const indexTypeName = this.calcTypeName(arg.indexType);
      return `${objectTypeName}[${indexTypeName}]`;
    } else if (arg.kind === ts.SyntaxKind.UnknownKeyword) {
      return 'unknown';
    } else if (arg.kind === ts.SyntaxKind.AnyKeyword) {
      return 'any';
    } else if (arg.kind === ts.SyntaxKind.NeverKeyword) {
      return 'never';
    } else if (ts.isConditionalTypeNode(arg)) {
      const checkTypeName = this.calcTypeName(arg.checkType);
      const extendsTypeName = this.calcTypeName(arg.extendsType);
      const trueTypeName = this.calcTypeName(arg.trueType);
      const falseTypeName = this.calcTypeName(arg.falseType);
      return `${checkTypeName} extends ${extendsTypeName} ? ${trueTypeName} : ${falseTypeName}`;
    } else if (ts.isParenthesizedTypeNode(arg)) {
      const internalTypeName = this.calcTypeName(arg.type);
      return `(${internalTypeName})`; //Parentheses are not really interesting. The type name generation adds parentheses for the clarity
    }
    const warning = new exceptions_1.GenerateMetaDataWarning(`This kind (${arg.kind}) is unhandled, so the type will be any, and no type conflict checks will made`, arg);
    console.warn(warning.toString());
    return 'any';
  }
  //Generates type name for type references
  calcTypeReferenceTypeName(node) {
    const type = TypeResolver.typeReferenceToEntityName(node);
    const refTypeName = this.calcRefTypeName(type);
    if (Array.isArray(node.typeArguments)) {
      // Add typeArguments for Synthetic nodes (e.g. Record<> in TestClassModel.indexedResponse)
      const argumentsString = node.typeArguments.map(type => this.calcTypeName(type));
      return `${refTypeName}<${argumentsString.join(', ')}>`;
    }
    return refTypeName;
  }
  getReferenceType(node, addToRefTypeMap = true) {
    const type = TypeResolver.typeReferenceToEntityName(node);
    const name = this.calcTypeReferenceTypeName(node);
    const refTypeName = this.getRefTypeName(name);
    this.current.CheckExpressionUnicity(refTypeName, name);
    this.context = this.typeArgumentsToContext(node, type);
    const calcReferenceType = () => {
      try {
        const existingType = localReferenceTypeCache[name];
        if (existingType) {
          return existingType;
        }
        if (inProgressTypes[name]) {
          return this.createCircularDependencyResolver(name, refTypeName);
        }
        inProgressTypes[name] = [];
        const declarations = this.getModelTypeDeclarations(type);
        const referenceTypes = [];
        for (const declaration of declarations) {
          if (ts.isTypeAliasDeclaration(declaration)) {
            const referencer = node.pos !== -1 ? this.current.typeChecker.getTypeFromTypeNode(node) : undefined;
            referenceTypes.push(this.getTypeAliasReference(declaration, refTypeName, referencer));
          } else if (ts.isEnumDeclaration(declaration)) {
            referenceTypes.push(this.getEnumerateType(declaration, refTypeName));
          } else if (ts.isEnumMember(declaration)) {
            referenceTypes.push({
              dataType: 'refEnum',
              refName: refTypeName,
              enums: [this.current.typeChecker.getConstantValue(declaration)],
              enumVarnames: [declaration.name.getText()],
              deprecated: (0, jsDocUtils_1.isExistJSDocTag)(declaration, tag => tag.tagName.text === 'deprecated'),
            });
          } else {
            referenceTypes.push(this.getModelReference(declaration, refTypeName));
          }
        }
        const referenceType = TypeResolver.mergeReferenceTypes(referenceTypes);
        this.addToLocalReferenceTypeCache(name, referenceType);
        return referenceType;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`There was a problem resolving type of '${name}'.`);
        throw err;
      }
    };
    const result = calcReferenceType();
    if (addToRefTypeMap) {
      this.current.AddReferenceType(result);
    }
    return result;
  }
  static mergeTwoRefEnumTypes(first, second) {
    const description = first.description ? (second.description ? `${first.description}\n${second.description}` : first.description) : second.description;
    const deprecated = first.deprecated || second.deprecated;
    const enums = first.enums ? (second.enums ? [...first.enums, ...second.enums] : first.enums) : second.enums;
    const enumVarnames = first.enumVarnames ? (second.enumVarnames ? [...first.enumVarnames, ...second.enumVarnames] : first.enumVarnames) : second.enumVarnames;
    return {
      dataType: 'refEnum',
      description,
      enums,
      enumVarnames,
      refName: first.refName,
      deprecated,
    };
  }
  static mergeTwoRefObjectTypes(first, second) {
    const description = first.description ? (second.description ? `${first.description}\n${second.description}` : first.description) : second.description;
    const deprecated = first.deprecated || second.deprecated;
    const example = first.example || second.example;
    const properties = [...first.properties, ...second.properties.filter(prop => first.properties.every(firstProp => firstProp.name !== prop.name))];
    const mergeAdditionalTypes = (first, second) => {
      return {
        dataType: 'union',
        types: [first, second],
      };
    };
    const additionalProperties = first.additionalProperties
      ? second.additionalProperties
        ? mergeAdditionalTypes(first.additionalProperties, second.additionalProperties)
        : first.additionalProperties
      : second.additionalProperties;
    const result = {
      dataType: 'refObject',
      description,
      properties,
      additionalProperties,
      refName: first.refName,
      deprecated,
      example,
    };
    return result;
  }
  static mergeReferenceTypes(referenceTypes) {
    if (referenceTypes.length === 1) {
      return referenceTypes[0];
    }
    if (referenceTypes.every(refType => refType.dataType === 'refEnum')) {
      const refEnumTypes = referenceTypes;
      let merged = TypeResolver.mergeTwoRefEnumTypes(refEnumTypes[0], refEnumTypes[1]);
      for (let i = 2; i < refEnumTypes.length; ++i) {
        merged = TypeResolver.mergeTwoRefEnumTypes(merged, refEnumTypes[i]);
      }
      return merged;
    }
    if (referenceTypes.every(refType => refType.dataType === 'refObject')) {
      const refObjectTypes = referenceTypes;
      let merged = TypeResolver.mergeTwoRefObjectTypes(refObjectTypes[0], refObjectTypes[1]);
      for (let i = 2; i < refObjectTypes.length; ++i) {
        merged = TypeResolver.mergeTwoRefObjectTypes(merged, refObjectTypes[i]);
      }
      return merged;
    }
    throw new exceptions_1.GenerateMetadataError(`These resolved type merge rules are not defined: ${JSON.stringify(referenceTypes)}`);
  }
  addToLocalReferenceTypeCache(name, refType) {
    if (inProgressTypes[name]) {
      for (const fn of inProgressTypes[name]) {
        fn(refType);
      }
    }
    localReferenceTypeCache[name] = refType;
    delete inProgressTypes[name];
  }
  getTypeAliasReference(declaration, refTypeName, referencer) {
    const example = this.getNodeExample(declaration);
    const referenceType = {
      dataType: 'refAlias',
      default: TypeResolver.getDefault(declaration),
      description: this.getNodeDescription(declaration),
      refName: refTypeName,
      format: this.getNodeFormat(declaration),
      type: new TypeResolver(declaration.type, this.current, declaration, this.context, this.referencer || referencer).resolve(),
      validators: (0, validatorUtils_1.getPropertyValidators)(declaration) || {},
      ...(example && { example }),
    };
    return referenceType;
  }
  getModelReference(modelType, refTypeName) {
    const example = this.getNodeExample(modelType);
    const description = this.getNodeDescription(modelType);
    const deprecated =
      (0, jsDocUtils_1.isExistJSDocTag)(modelType, tag => tag.tagName.text === 'deprecated') || (0, decoratorUtils_1.isDecorator)(modelType, identifier => identifier.text === 'Deprecated');
    // Handle toJSON methods
    if (!modelType.name) {
      throw new exceptions_1.GenerateMetadataError("Can't get Symbol from anonymous class", modelType);
    }
    const type = this.current.typeChecker.getTypeAtLocation(modelType.name);
    const toJSON = this.current.typeChecker.getPropertyOfType(type, 'toJSON');
    if (toJSON && toJSON.valueDeclaration && (ts.isMethodDeclaration(toJSON.valueDeclaration) || ts.isMethodSignature(toJSON.valueDeclaration))) {
      let nodeType = toJSON.valueDeclaration.type;
      if (!nodeType) {
        const signature = this.current.typeChecker.getSignatureFromDeclaration(toJSON.valueDeclaration);
        const implicitType = this.current.typeChecker.getReturnTypeOfSignature(signature);
        nodeType = this.current.typeChecker.typeToTypeNode(implicitType, undefined, ts.NodeBuilderFlags.NoTruncation);
      }
      const type = new TypeResolver(nodeType, this.current).resolve();
      const referenceType = {
        refName: refTypeName,
        dataType: 'refAlias',
        description,
        type,
        validators: {},
        deprecated,
        ...(example && { example }),
      };
      return referenceType;
    }
    const properties = this.getModelProperties(modelType);
    const additionalProperties = this.getModelAdditionalProperties(modelType);
    const inheritedProperties = this.getModelInheritedProperties(modelType) || [];
    const referenceType = {
      additionalProperties,
      dataType: 'refObject',
      description,
      properties: inheritedProperties,
      refName: refTypeName,
      deprecated,
      ...(example && { example }),
    };
    referenceType.properties = referenceType.properties.concat(properties);
    return referenceType;
  }
  //Generates a name from the original type expression.
  //This function is not invertable, so it's possible, that 2 type expressions have the same refTypeName.
  getRefTypeName(name) {
    const preformattedName = name //Preformatted name handles most cases
      .replace(/<|>/g, '_')
      .replace(/\s+/g, '')
      .replace(/,/g, '.')
      .replace(/'([^']*)'/g, '$1')
      .replace(/"([^"]*)"/g, '$1')
      .replace(/&/g, '-and-')
      .replace(/\|/g, '-or-')
      .replace(/\[\]/g, '-Array')
      .replace(/{|}/g, '_') // SuccessResponse_{indexesCreated-number}_ -> SuccessResponse__indexesCreated-number__
      .replace(/([a-z_0-9]+\??):([a-z]+)/gi, '$1-$2') // SuccessResponse_indexesCreated:number_ -> SuccessResponse_indexesCreated-number_
      .replace(/;/g, '--')
      .replace(/([a-z})\]])\[([a-z]+)\]/gi, '$1-at-$2'); // Partial_SerializedDatasourceWithVersion[format]_ -> Partial_SerializedDatasourceWithVersion~format~_,
    //Safety fixes to replace all characters which are not accepted by swagger ui
    let formattedName = preformattedName.replace(/[^A-Za-z0-9\-._]/g, match => {
      return `_${match.charCodeAt(0)}_`;
    });
    formattedName = formattedName.replace(/92_r_92_n/g, '92_n'); //Windows uses \r\n, but linux uses \n.
    return formattedName;
  }
  createCircularDependencyResolver(refName, refTypeName) {
    const referenceType = {
      dataType: 'refObject',
      refName: refTypeName,
    };
    inProgressTypes[refName].push(realReferenceType => {
      for (const key of Object.keys(realReferenceType)) {
        referenceType[key] = realReferenceType[key];
      }
    });
    return referenceType;
  }
  nodeIsUsable(node) {
    switch (node.kind) {
      case ts.SyntaxKind.InterfaceDeclaration:
      case ts.SyntaxKind.ClassDeclaration:
      case ts.SyntaxKind.TypeAliasDeclaration:
      case ts.SyntaxKind.EnumDeclaration:
      case ts.SyntaxKind.EnumMember:
        return true;
      default:
        return false;
    }
  }
  getModelTypeDeclarations(type) {
    let typeName = type.kind === ts.SyntaxKind.Identifier ? type.text : type.right.text;
    let symbol = this.getSymbolAtLocation(type);
    if (!symbol && type.kind === ts.SyntaxKind.QualifiedName) {
      const fullEnumSymbol = this.getSymbolAtLocation(type.left);
      symbol = fullEnumSymbol.exports?.get(typeName);
    }
    const declarations = symbol?.getDeclarations();
    if (!symbol || !declarations) {
      throw new exceptions_1.GenerateMetadataError(`No declarations found for referenced type ${typeName}.`);
    }
    if (symbol.escapedName !== typeName && symbol.escapedName !== 'default') {
      typeName = symbol.escapedName;
    }
    let modelTypes = declarations.filter(node => {
      return this.nodeIsUsable(node) && node.name?.getText() === typeName;
    });
    if (!modelTypes.length) {
      throw new exceptions_1.GenerateMetadataError(`No matching model found for referenced type ${typeName}.`);
    }
    if (modelTypes.length > 1) {
      // remove types that are from typescript e.g. 'Account'
      modelTypes = modelTypes.filter(modelType => {
        return modelType.getSourceFile().fileName.replace(/\\/g, '/').toLowerCase().indexOf('node_modules/typescript') <= -1;
      });
      modelTypes = this.getDesignatedModels(modelTypes, typeName);
    }
    return modelTypes;
  }
  getSymbolAtLocation(type) {
    const symbol = this.current.typeChecker.getSymbolAtLocation(type) || type.symbol;
    // resolve alias if it is an alias, otherwise take symbol directly
    return (symbol && this.hasFlag(symbol, ts.SymbolFlags.Alias) && this.current.typeChecker.getAliasedSymbol(symbol)) || symbol;
  }
  getModelProperties(node, overrideToken) {
    const isIgnored = e => {
      let ignore = (0, jsDocUtils_1.isExistJSDocTag)(e, tag => tag.tagName.text === 'ignore');
      ignore = ignore || (e.flags & ts.NodeFlags.ThisNodeHasError) > 0;
      return ignore;
    };
    // Interface model
    if (ts.isInterfaceDeclaration(node)) {
      return node.members.filter(member => !isIgnored(member) && ts.isPropertySignature(member)).map(member => this.propertyFromSignature(member, overrideToken));
    }
    const properties = [];
    for (const member of node.members) {
      if (!isIgnored(member) && ts.isPropertyDeclaration(member) && !this.hasStaticModifier(member) && this.hasPublicModifier(member)) {
        properties.push(member);
      }
    }
    const classConstructor = node.members.find(member => ts.isConstructorDeclaration(member));
    if (classConstructor && classConstructor.parameters) {
      const constructorProperties = classConstructor.parameters.filter(parameter => this.isAccessibleParameter(parameter));
      properties.push(...constructorProperties);
    }
    return properties.map(property => this.propertyFromDeclaration(property, overrideToken));
  }
  propertyFromSignature(propertySignature, overrideToken) {
    const identifier = propertySignature.name;
    if (!propertySignature.type) {
      throw new exceptions_1.GenerateMetadataError(`No valid type found for property declaration.`);
    }
    let required = !propertySignature.questionToken;
    if (overrideToken && overrideToken.kind === ts.SyntaxKind.MinusToken) {
      required = true;
    } else if (overrideToken && overrideToken.kind === ts.SyntaxKind.QuestionToken) {
      required = false;
    }
    const def = TypeResolver.getDefault(propertySignature);
    const property = {
      default: def,
      description: this.getNodeDescription(propertySignature),
      example: this.getNodeExample(propertySignature),
      format: this.getNodeFormat(propertySignature),
      name: identifier.text,
      required,
      type: new TypeResolver(propertySignature.type, this.current, propertySignature.type.parent, this.context).resolve(),
      validators: (0, validatorUtils_1.getPropertyValidators)(propertySignature) || {},
      deprecated: (0, jsDocUtils_1.isExistJSDocTag)(propertySignature, tag => tag.tagName.text === 'deprecated'),
      extensions: this.getNodeExtension(propertySignature),
    };
    return property;
  }
  propertyFromDeclaration(propertyDeclaration, overrideToken) {
    const identifier = propertyDeclaration.name;
    let typeNode = propertyDeclaration.type;
    const tsType = this.current.typeChecker.getTypeAtLocation(propertyDeclaration);
    if (!typeNode) {
      // Type is from initializer
      typeNode = this.current.typeChecker.typeToTypeNode(tsType, undefined, ts.NodeBuilderFlags.NoTruncation);
    }
    const type = new TypeResolver(typeNode, this.current, propertyDeclaration, this.context, tsType).resolve();
    let required = !propertyDeclaration.questionToken && !propertyDeclaration.initializer;
    if (overrideToken && overrideToken.kind === ts.SyntaxKind.MinusToken) {
      required = true;
    } else if (overrideToken && overrideToken.kind === ts.SyntaxKind.QuestionToken) {
      required = false;
    }
    let def = (0, initializer_value_1.getInitializerValue)(propertyDeclaration.initializer, this.current.typeChecker);
    if (def === undefined) {
      def = TypeResolver.getDefault(propertyDeclaration);
    }
    const property = {
      default: def,
      description: this.getNodeDescription(propertyDeclaration),
      example: this.getNodeExample(propertyDeclaration),
      format: this.getNodeFormat(propertyDeclaration),
      name: identifier.text,
      required,
      type,
      validators: (0, validatorUtils_1.getPropertyValidators)(propertyDeclaration) || {},
      // class properties and constructor parameters may be deprecated either via jsdoc annotation or decorator
      deprecated:
        (0, jsDocUtils_1.isExistJSDocTag)(propertyDeclaration, tag => tag.tagName.text === 'deprecated') ||
        (0, decoratorUtils_1.isDecorator)(propertyDeclaration, identifier => identifier.text === 'Deprecated'),
      extensions: this.getNodeExtension(propertyDeclaration),
    };
    return property;
  }
  getModelAdditionalProperties(node) {
    if (node.kind === ts.SyntaxKind.InterfaceDeclaration) {
      const interfaceDeclaration = node;
      const indexMember = interfaceDeclaration.members.find(member => member.kind === ts.SyntaxKind.IndexSignature);
      if (!indexMember) {
        return undefined;
      }
      const indexSignatureDeclaration = indexMember;
      const indexType = new TypeResolver(indexSignatureDeclaration.parameters[0].type, this.current, this.parentNode, this.context).resolve();
      if (indexType.dataType !== 'string') {
        throw new exceptions_1.GenerateMetadataError(`Only string indexers are supported.`, this.typeNode);
      }
      return new TypeResolver(indexSignatureDeclaration.type, this.current, this.parentNode, this.context).resolve();
    }
    return undefined;
  }
  typeArgumentsToContext(type, targetEntity) {
    let newContext = {};
    const declaration = this.getModelTypeDeclarations(targetEntity);
    const typeParameters = 'typeParameters' in declaration[0] ? declaration[0].typeParameters : undefined;
    if (typeParameters) {
      for (let index = 0; index < typeParameters.length; index++) {
        const typeParameter = typeParameters[index];
        const typeArg = type.typeArguments && type.typeArguments[index];
        let resolvedType;
        let name;
        // Argument may be a forward reference from context
        if (typeArg && ts.isTypeReferenceNode(typeArg) && ts.isIdentifier(typeArg.typeName) && this.context[typeArg.typeName.text]) {
          resolvedType = this.context[typeArg.typeName.text].type;
          name = this.context[typeArg.typeName.text].name;
        } else if (typeArg) {
          resolvedType = typeArg;
        } else if (typeParameter.default) {
          resolvedType = typeParameter.default;
        } else {
          throw new exceptions_1.GenerateMetadataError(`Could not find a value for type parameter ${typeParameter.name.text}`, type);
        }
        newContext = {
          ...newContext,
          [typeParameter.name.text]: {
            type: resolvedType,
            name: name || this.calcTypeName(resolvedType),
          },
        };
      }
    }
    return newContext;
  }
  getModelInheritedProperties(modelTypeDeclaration) {
    let properties = [];
    const heritageClauses = modelTypeDeclaration.heritageClauses;
    if (!heritageClauses) {
      return properties;
    }
    for (const clause of heritageClauses) {
      if (!clause.types) {
        continue;
      }
      for (const t of clause.types) {
        const baseEntityName = t.expression;
        // create subContext
        const resetCtx = this.context;
        this.context = this.typeArgumentsToContext(t, baseEntityName);
        const referenceType = this.getReferenceType(t, false);
        if (referenceType) {
          if (referenceType.dataType === 'refEnum') {
            // since it doesn't have properties to iterate over, then we don't do anything with it
          } else if (referenceType.dataType === 'refAlias') {
            let type = referenceType;
            while (type.dataType === 'refAlias') {
              type = type.type;
            }
            if (type.dataType === 'refObject') {
              properties = [...properties, ...type.properties];
            } else if (type.dataType === 'nestedObjectLiteral') {
              properties = [...properties, ...type.properties];
            }
          } else if (referenceType.dataType === 'refObject') {
            (referenceType.properties || []).forEach(property => properties.push(property));
          } else {
            (0, runtime_1.assertNever)(referenceType);
          }
        }
        // reset subContext
        this.context = resetCtx;
      }
    }
    return properties;
  }
  hasPublicModifier(node) {
    return (
      !node.modifiers ||
      node.modifiers.every(modifier => {
        return modifier.kind !== ts.SyntaxKind.ProtectedKeyword && modifier.kind !== ts.SyntaxKind.PrivateKeyword;
      })
    );
  }
  hasStaticModifier(node) {
    return (
      node.modifiers &&
      node.modifiers.some(modifier => {
        return modifier.kind === ts.SyntaxKind.StaticKeyword;
      })
    );
  }
  isAccessibleParameter(node) {
    const modifiers = ts.getModifiers(node);
    if (modifiers == null || modifiers.length === 0) {
      return false;
    }
    // public || public readonly
    if (modifiers.some(modifier => modifier.kind === ts.SyntaxKind.PublicKeyword)) {
      return true;
    }
    // readonly, not private readonly, not public readonly
    const isReadonly = modifiers.some(modifier => modifier.kind === ts.SyntaxKind.ReadonlyKeyword);
    const isProtectedOrPrivate = modifiers.some(modifier => {
      return modifier.kind === ts.SyntaxKind.ProtectedKeyword || modifier.kind === ts.SyntaxKind.PrivateKeyword;
    });
    return isReadonly && !isProtectedOrPrivate;
  }
  getNodeDescription(node) {
    const symbol = this.getSymbolAtLocation(node.name);
    if (!symbol) {
      return undefined;
    }
    /**
     * TODO: Workaround for what seems like a bug in the compiler
     * Warrants more investigation and possibly a PR against typescript
     */
    if (node.kind === ts.SyntaxKind.Parameter) {
      // TypeScript won't parse jsdoc if the flag is 4, i.e. 'Property'
      symbol.flags = 0;
    }
    const comments = symbol.getDocumentationComment(this.current.typeChecker);
    if (comments.length) {
      return ts.displayPartsToString(comments);
    }
    return undefined;
  }
  getNodeFormat(node) {
    return (0, jsDocUtils_1.getJSDocComment)(node, 'format');
  }
  getNodeExample(node) {
    const exampleJSDoc = (0, jsDocUtils_1.getJSDocComment)(node, 'example');
    if (exampleJSDoc) {
      return (0, jsonUtils_1.safeFromJson)(exampleJSDoc);
    }
    return (0, decoratorUtils_1.getNodeFirstDecoratorValue)(node, this.current.typeChecker, dec => dec.text === 'Example');
  }
  getNodeExtension(node) {
    const decorators = this.getDecoratorsByIdentifier(node, 'Extension');
    const extensionDecorator = (0, extension_1.getExtensions)(decorators, this.current);
    const extensionComments = (0, jsDocUtils_1.getJSDocComments)(node, 'extension');
    const extensionJSDoc = extensionComments ? (0, extension_1.getExtensionsFromJSDocComments)(extensionComments) : [];
    return extensionDecorator.concat(extensionJSDoc);
  }
  getDecoratorsByIdentifier(node, id) {
    return (0, decoratorUtils_1.getDecorators)(node, identifier => identifier.text === id);
  }
  static getDefault(node) {
    const defaultStr = (0, jsDocUtils_1.getJSDocComment)(node, 'default');
    if (typeof defaultStr == 'string' && defaultStr !== 'undefined') {
      let textStartCharacter = undefined;
      const inString = () => textStartCharacter !== undefined;
      let formattedStr = '';
      for (let i = 0; i < defaultStr.length; ++i) {
        const actCharacter = defaultStr[i];
        if (inString()) {
          if (actCharacter === textStartCharacter) {
            formattedStr += '"';
            textStartCharacter = undefined;
          } else if (actCharacter === '"') {
            formattedStr += '\\"';
          } else if (actCharacter === '\\') {
            ++i;
            if (i < defaultStr.length) {
              const nextCharacter = defaultStr[i];
              if (['n', 't', 'r', 'b', 'f', '\\', '"'].includes(nextCharacter)) {
                formattedStr += '\\' + nextCharacter;
              } else if (!['v', '0'].includes(nextCharacter)) {
                //\v, \0 characters are not compatible with JSON
                formattedStr += nextCharacter;
              }
            } else {
              formattedStr += actCharacter; // this is a bug, but let the JSON parser decide how to handle it
            }
          } else {
            formattedStr += actCharacter;
          }
        } else {
          if ([`"`, "'", '`'].includes(actCharacter)) {
            textStartCharacter = actCharacter;
            formattedStr += '"';
          } else if (actCharacter === '/' && i + 1 < defaultStr.length && defaultStr[i + 1] === '/') {
            i += 2;
            while (i < defaultStr.length && defaultStr[i] !== '\n') {
              ++i;
            }
          } else {
            formattedStr += actCharacter;
          }
        }
      }
      try {
        const parsed = JSON.parse(formattedStr);
        return parsed;
      } catch (err) {
        throw new exceptions_1.GenerateMetadataError(`JSON could not parse default str: "${defaultStr}", preformatted: "${formattedStr}"\nmessage: "${err?.message || '-'}"`);
      }
    }
    return undefined;
  }
}
exports.TypeResolver = TypeResolver;
//# sourceMappingURL=typeResolver.js.map
