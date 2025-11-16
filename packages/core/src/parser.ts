import type { JSONSchema, FieldNode, GroupNode, WalkHandlers, FieldParts, GroupParts } from './types';

// JSONSchema can be a boolean in draft-07, but we only work with object schemas
type JSONSchemaObject = Exclude<JSONSchema, boolean>;

// Type guard for object schemas
function isObjectSchema(schema: JSONSchema): schema is JSONSchemaObject {
  return typeof schema === 'object' && schema !== null;
}

// Helper to compute base node properties
function computeBaseProps(path: string, schema: JSONSchemaObject) {
  const isRoot = path === '';
  const segments = path ? path.split('.') : [];
  const depth = isRoot ? 0 : segments.length;
  const key = segments[segments.length - 1] || '';
  const parentPath = segments.slice(0, -1).join('.');
  const displayLabel = schema.title || path || 'root';
  
  return { isRoot, depth, key, parentPath, displayLabel };
}

export function parseSchema(schema: JSONSchema): GroupNode {
  if (!isObjectSchema(schema)) {
    throw new Error('Boolean schemas are not yet supported');
  }
  
  // Root is just a GroupNode with empty path
  return createGroupNode('', schema, false);
}

function createFieldNode(
  path: string,
  schema: JSONSchemaObject,
  required: boolean
): FieldNode {
  const baseProps = computeBaseProps(path, schema);
  const attrs = buildAttrs(schema, required);
  
  const parts: FieldParts = {
    container: {
      key: path,
    },
    label: {
      text: baseProps.displayLabel,
      htmlFor: path,
      showRequired: required,
    },
    input: {
      id: path,
      name: path,
      attrs,
    },
  };
  
  // Add description part if present
  if (schema.description) {
    parts.description = {
      text: schema.description,
    };
  }
  
  return {
    nodeType: 'field',
    path,
    schema,
    label: schema.title,
    description: schema.description,
    required,
    widget: 'input', // Default for now
    attrs,
    
    // Computed properties
    ...baseProps,
    
    // Parts API
    parts,
    
    isField(): this is FieldNode {
      return true;
    },
    
    isGroup(): this is GroupNode {
      return false;
    },
  };
}

function createGroupNode(
  path: string,
  schema: JSONSchemaObject,
  required: boolean
): GroupNode {
  const children: Array<FieldNode | GroupNode> = [];
  const requiredFields = schema.required || [];

  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (!isObjectSchema(propSchema)) continue; // Skip boolean schemas
      
      const childPath = path ? `${path}.${key}` : key; // Handle root path
      const isRequired = requiredFields.includes(key);
      
      if (propSchema.type === 'object' && propSchema.properties) {
        children.push(createGroupNode(childPath, propSchema, isRequired));
      } else {
        children.push(createFieldNode(childPath, propSchema, isRequired));
      }
    }
  }

  const baseProps = computeBaseProps(path, schema);
  
  const parts: GroupParts = {
    container: {
      key: path,
    },
  };
  
  // Add label part if present
  if (schema.title) {
    parts.label = {
      text: schema.title,
    };
  }
  
  // Add description part if present
  if (schema.description) {
    parts.description = {
      text: schema.description,
    };
  }
  
  const groupNode: GroupNode = {
    nodeType: 'group',
    path,
    schema,
    label: schema.title,
    description: schema.description,
    required,
    widget: 'fieldset',
    children,
    
    // Computed properties
    ...baseProps,
    
    // Parts API
    parts,
    
    getField(targetPath: string): FieldNode | undefined {
      // Search descendants relative to this group
      // If this group has path 'address', searching for 'street' finds 'address.street'
      const fullPath = path ? `${path}.${targetPath}` : targetPath;
      
      for (const child of children) {
        if (child.nodeType === 'field' && child.path === fullPath) {
          return child;
        } else if (child.nodeType === 'group') {
          // Check if target is within this child group
          if (fullPath.startsWith(child.path + '.') || fullPath === child.path) {
            const relativePath = fullPath.substring(child.path.length + 1);
            const found = child.getField(relativePath);
            if (found) return found;
          }
        }
      }
      return undefined;
    },
    
    getAllFields(): FieldNode[] {
      const fields: FieldNode[] = [];
      
      for (const child of children) {
        if (child.nodeType === 'field') {
          fields.push(child);
        } else if (child.nodeType === 'group') {
          fields.push(...child.getAllFields());
        }
      }
      
      return fields;
    },
    
    walk<R>(handlers?: WalkHandlers<R>): R[] {
      return walkNode(groupNode, handlers);
    },
    
    isField(): this is FieldNode {
      return false;
    },
    
    isGroup(): this is GroupNode {
      return true;
    },
    
    toJSON() {
      return serializeNode(this);
    },
  };
  
  return groupNode;
}

// Helper to serialize nodes without circular references or functions
function serializeNode(node: FieldNode | GroupNode): object {
  if (node.nodeType === 'field') {
    return {
      nodeType: node.nodeType,
      path: node.path,
      title: node.label,
      description: node.description,
      required: node.required,
      widget: node.widget,
      attrs: node.attrs,
      // Omit schema to avoid circular refs
    };
  } else {
    return {
      nodeType: node.nodeType,
      path: node.path,
      title: node.label,
      description: node.description,
      required: node.required,
      widget: node.widget,
      children: node.children.map(child => serializeNode(child)),
      // Omit schema and methods to avoid circular refs
    };
  }
}

function buildAttrs(schema: JSONSchemaObject, required: boolean): Record<string, any> {
  const attrs: Record<string, any> = {};
  
  // HTML input type
  if (schema.type === 'string') {
    if (schema.format === 'email') {
      attrs.type = 'email';
    } else {
      attrs.type = 'text';
    }
  } else if (schema.type === 'number' || schema.type === 'integer') {
    attrs.type = 'number';
  }
  
  // Required
  if (required) {
    attrs.required = true;
  }
  
  // Number constraints
  if (schema.minimum !== undefined) {
    attrs.min = schema.minimum;
  }
  if (schema.maximum !== undefined) {
    attrs.max = schema.maximum;
  }
  
  // String constraints
  if (schema.minLength !== undefined) {
    attrs.minLength = schema.minLength;
  }
  if (schema.maxLength !== undefined) {
    attrs.maxLength = schema.maxLength;
  }
  if (schema.pattern !== undefined) {
    attrs.pattern = schema.pattern;
  }
  
  return attrs;
}

// Walk implementation with handler inheritance
let currentHandlers: WalkHandlers<any> | undefined;

function walkNode<R>(node: GroupNode, handlers?: WalkHandlers<R>): R[] {
  // First call sets handlers, nested calls inherit
  const effectiveHandlers = handlers || currentHandlers;
  if (!effectiveHandlers) {
    throw new Error('walk() requires handlers on first call');
  }
  
  // Set current handlers for inheritance
  const previousHandlers = currentHandlers;
  currentHandlers = effectiveHandlers;
  
  try {
    const results: R[] = [];
    
    for (const child of node.children) {
      if (child.nodeType === 'field' && effectiveHandlers.field) {
        const result = effectiveHandlers.field(child);
        results.push(result);
      } else if (child.nodeType === 'group') {
        if (effectiveHandlers.group) {
          // Group handler provided - use it
          const result = effectiveHandlers.group(child);
          results.push(result);
        } else {
          // No group handler - transparently walk children
          results.push(...child.walk());
        }
      }
    }
    
    return results;
  } finally {
    // Restore previous handlers
    currentHandlers = previousHandlers;
  }
}

