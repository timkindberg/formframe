import type { JSONSchema, RootNode, FieldNode, GroupNode } from './types';

// JSONSchema can be a boolean in draft-07, but we only work with object schemas
type JSONSchemaObject = Exclude<JSONSchema, boolean>;

// Type guard for object schemas
function isObjectSchema(schema: JSONSchema): schema is JSONSchemaObject {
  return typeof schema === 'object' && schema !== null;
}

export function parseSchema(schema: JSONSchema): RootNode {
  if (!isObjectSchema(schema)) {
    throw new Error('Boolean schemas are not yet supported');
  }
  const children: Array<FieldNode | GroupNode> = [];

  if (schema.type === 'object' && schema.properties) {
    const requiredFields = schema.required || [];
    
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (!isObjectSchema(propSchema)) continue; // Skip boolean schemas
      
      const path = key;
      const isRequired = requiredFields.includes(key);
      
      // Check if it's a nested object
      if (propSchema.type === 'object' && propSchema.properties) {
        // It's a group
        children.push(createGroupNode(path, propSchema, isRequired));
      } else {
        // It's a field
        children.push(createFieldNode(path, propSchema, isRequired));
      }
    }
  }

  return createRootNode(children);
}

function createFieldNode(
  path: string,
  schema: JSONSchemaObject,
  required: boolean
): FieldNode {
  return {
    nodeType: 'field',
    path,
    schema,
    title: schema.title,
    description: schema.description,
    required,
    widget: 'input', // Default for now
    attrs: buildAttrs(schema, required),
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
      
      const childPath = `${path}.${key}`;
      const isRequired = requiredFields.includes(key);
      
      if (propSchema.type === 'object' && propSchema.properties) {
        children.push(createGroupNode(childPath, propSchema, isRequired));
      } else {
        children.push(createFieldNode(childPath, propSchema, isRequired));
      }
    }
  }

  return {
    nodeType: 'group',
    path,
    schema,
    title: schema.title,
    description: schema.description,
    required,
    widget: 'fieldset',
    children,
    getChild(name: string) {
      return children.find(child => child.path === `${path}.${name}` || child.path === name);
    },
    getChildren() {
      return children;
    },
  };
}

function createRootNode(children: Array<FieldNode | GroupNode>): RootNode {
  return {
    nodeType: 'root',
    children,
    
    getField(path: string): FieldNode | undefined {
      // Flatten all fields and find by path
      const allFields = this.getAllFields();
      return allFields.find(field => field.path === path);
    },
    
    getAllFields(): FieldNode[] {
      const fields: FieldNode[] = [];
      
      function collectFields(nodes: Array<FieldNode | GroupNode>) {
        for (const node of nodes) {
          if (node.nodeType === 'field') {
            fields.push(node);
          } else if (node.nodeType === 'group') {
            collectFields(node.children);
          }
        }
      }
      
      collectFields(children);
      return fields;
    },
    
    toJSON() {
      // Serialize without functions and avoid circular refs
      return {
        nodeType: this.nodeType,
        children: this.children.map(child => serializeNode(child)),
      };
    },
  };
}

// Helper to serialize nodes without circular references or functions
function serializeNode(node: FieldNode | GroupNode): object {
  if (node.nodeType === 'field') {
    return {
      nodeType: node.nodeType,
      path: node.path,
      title: node.title,
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
      title: node.title,
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

