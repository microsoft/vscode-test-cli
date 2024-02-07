/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { promises as fs } from 'fs';

export const ensureArray = <T,>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);

export const readJSON = async <T,>(path: string): Promise<T> =>
  JSON.parse(await fs.readFile(path, 'utf8'));

export const writeJSON = async (path: string, value: unknown) =>
  fs.writeFile(path, JSON.stringify(value));

/**
 * Applies the "replacer" function to primitive keys and properties of the object,
 * mutating it in-place.
 */
export const mutateObjectPrimitives = (obj: any, replacer: (value: any) => any): any => {
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = mutateObjectPrimitives(obj[i], replacer);
    }
    return obj;
  }
  if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const newKey = replacer(key);
      if (newKey !== key) {
        delete obj[key];
      }
      obj[newKey] = mutateObjectPrimitives(value, replacer);
    }
    return obj;
  }

  return replacer(obj);
};
