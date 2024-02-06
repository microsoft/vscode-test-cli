/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

export const ensureArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);
