import 'reflect-metadata';
import { RequestMethod, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  MODULE_METADATA,
  PATH_METADATA,
  METHOD_METADATA,
  GUARDS_METADATA,
} from '@nestjs/common/constants';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from '../app.module';
import { generatePublicDocument } from './openapi-support';
import { buildSportOpenApi } from './openapi';

const verbs = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
] as const;
const controllerTypes = new Set<Type<unknown>>();
function actualPublicRoutes(): string[] {
  const routes = new Set<string>(),
    visited = new Set<Type<unknown>>();
  function visit(module: Type<unknown>): void {
    if (visited.has(module)) return;
    visited.add(module);
    const controllers: unknown = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      module,
    );
    if (Array.isArray(controllers))
      for (const controller of controllers as unknown[]) {
        if (typeof controller !== 'function') continue;
        controllerTypes.add(controller as Type<unknown>);
        const prefix: unknown = Reflect.getMetadata(PATH_METADATA, controller);
        if (typeof prefix !== 'string') continue;
        const prototype: unknown = controller.prototype;
        if (!prototype || typeof prototype !== 'object') continue;
        for (const name of Object.getOwnPropertyNames(prototype)) {
          const handler: unknown = Object.getOwnPropertyDescriptor(
            prototype,
            name,
          )?.value;
          if (typeof handler !== 'function') continue;
          const method: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
          const suffix: unknown = Reflect.getMetadata(PATH_METADATA, handler);
          if (typeof method !== 'number' || typeof suffix !== 'string')
            continue;
          const path = (
            '/' +
            [prefix, suffix]
              .map((part) => part.replace(/^\/+|\/+$/g, ''))
              .filter(Boolean)
              .join('/')
          ).replace(/:([^/]+)/g, '{$1}');
          if (path.startsWith('/api/v1/'))
            routes.add(`${RequestMethod[method].toLowerCase()} ${path}`);
        }
      }
    const imports: unknown = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      module,
    );
    if (Array.isArray(imports))
      for (const entry of imports as unknown[]) {
        if (typeof entry === 'function') visit(entry as Type<unknown>);
        else if (
          entry &&
          typeof entry === 'object' &&
          'module' in entry &&
          typeof entry.module === 'function'
        )
          visit(entry.module as Type<unknown>);
      }
  }
  visit(AppModule);
  return [...routes].sort();
}
function documentedRoutes(doc: OpenAPIObject): string[] {
  return Object.entries(doc.paths)
    .flatMap(([path, item]) =>
      verbs.filter((verb) => item[verb]).map((verb) => `${verb} ${path}`),
    )
    .sort();
}
function checkReferences(value: unknown, doc: OpenAPIObject): void {
  if (!value || typeof value !== 'object') return;
  if ('$ref' in value && typeof value.$ref === 'string') {
    expect(value.$ref.startsWith('#/components/schemas/')).toBe(true);
    let target: unknown = doc;
    for (const part of value.$ref.slice(2).split('/')) {
      const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
      if (!target || typeof target !== 'object' || !Object.hasOwn(target, key))
        throw new Error(`Unresolved reference: ${value.$ref}`);
      target = (target as Record<string, unknown>)[key];
    }
  }
  for (const child of Object.values(value)) checkReferences(child, doc);
}

describe('Public OpenAPI contract', () => {
  it('generates all public controller routes with complete schemas and excludes internal routes and models', async () => {
    const doc = buildSportOpenApi();
    expect(documentedRoutes(doc)).toEqual(actualPublicRoutes());
    expect(actualPublicRoutes().length).toBeGreaterThan(0);
    checkReferences(doc, doc);
    for (const item of Object.values(doc.paths))
      for (const verb of verbs) {
        const operation = item[verb];
        if (!operation) continue;
        expect(operation.summary).toBeTruthy();
        expect(operation.tags?.length).toBeGreaterThan(0);
        for (const [status, response] of Object.entries(operation.responses)) {
          if (!response || '$ref' in response) continue;
          if (status === '204') expect(response.content).toBeUndefined();
          else
            expect(
              response.content?.['application/json']?.schema,
            ).toBeDefined();
        }
      }
    const dependencies = new Set<Type<unknown>>();
    const addDependencies = (target: object) => {
      const types: unknown = Reflect.getMetadata('design:paramtypes', target);
      if (Array.isArray(types))
        for (const type of types as unknown[])
          if (typeof type === 'function')
            dependencies.add(type as Type<unknown>);
    };
    const addGuards = (target: object) => {
      const guards: unknown = Reflect.getMetadata(GUARDS_METADATA, target);
      if (Array.isArray(guards))
        for (const guard of guards as unknown[])
          if (typeof guard === 'function') addDependencies(guard);
    };
    for (const controller of controllerTypes) {
      addDependencies(controller);
      addGuards(controller);
      const prototype: unknown = controller.prototype;
      if (!prototype || typeof prototype !== 'object') continue;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler: unknown = Object.getOwnPropertyDescriptor(
          prototype,
          name,
        )?.value;
        if (typeof handler === 'function') addGuards(handler);
      }
    }
    const module = await Test.createTestingModule({
      controllers: [...controllerTypes],
      providers: [...dependencies].map((provide) => ({
        provide,
        useValue: {},
      })),
    }).compile();
    // Only construct the Nest adapter for Swagger's route scanner: no listening socket,
    // HTTP request, database, session service or background process is started.
    const app = module.createNestApplication({ logger: false });
    try {
      const generated = generatePublicDocument(app, doc);
      expect(documentedRoutes(generated)).toEqual(actualPublicRoutes());
      expect(
        Object.keys(generated.paths).every((path) =>
          path.startsWith('/api/v1/'),
        ),
      ).toBe(true);
      expect(generated.components?.schemas).toEqual(doc.components?.schemas);
      expect(JSON.stringify(generated)).not.toContain('/internal');
      expect(JSON.stringify(generated)).not.toContain('password_hash');
      expect(JSON.stringify(generated)).not.toContain('credentials_encrypted');
    } finally {
      await app.close();
    }
  });
});
