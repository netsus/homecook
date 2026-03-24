import { readFileSync } from "node:fs";
import path from "node:path";

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function joinPath(basePath, segment) {
  return basePath ? `${basePath}.${segment}` : segment;
}

export function validateKnownShape(schema, data, basePath = "") {
  const errors = [];
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const properties =
    schema?.properties && typeof schema.properties === "object" ? schema.properties : {};

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return [
      {
        path: basePath || "<root>",
        message: "Expected object value.",
      },
    ];
  }

  for (const key of required) {
    if (!(key in data)) {
      errors.push({
        path: joinPath(basePath, key),
        message: "Missing required field.",
      });
    }
  }

  for (const [key, definition] of Object.entries(properties)) {
    if (!(key in data)) continue;

    const value = data[key];
    const currentPath = joinPath(basePath, key);

    if (Array.isArray(definition.enum) && !definition.enum.includes(value)) {
      errors.push({
        path: currentPath,
        message: `Value must be one of: ${definition.enum.join(", ")}`,
      });
    }

    if (definition.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
      errors.push(...validateKnownShape(definition, value, currentPath));
      continue;
    }

    if (definition.type === "array" && Array.isArray(value) && definition.items) {
      const itemDefinition =
        typeof definition.items === "object" && definition.items !== null ? definition.items : null;

      if (Array.isArray(itemDefinition?.enum)) {
        value.forEach((item, index) => {
          if (!itemDefinition.enum.includes(item)) {
            errors.push({
              path: `${currentPath}[${index}]`,
              message: `Value must be one of: ${itemDefinition.enum.join(", ")}`,
            });
          }
        });
      }

      if (
        itemDefinition?.type === "object" &&
        value.every((item) => item && typeof item === "object" && !Array.isArray(item))
      ) {
        value.forEach((item, index) => {
          errors.push(...validateKnownShape(itemDefinition, item, `${currentPath}[${index}]`));
        });
      }
    }
  }

  return errors;
}

export function validateWorkflowV2Examples({ rootDir = process.cwd() } = {}) {
  const baseDir = path.join(rootDir, "docs/engineering/workflow-v2");
  const targets = [
    {
      name: "work-item",
      schemaPath: path.join(baseDir, "schemas/work-item.schema.json"),
      examplePath: path.join(baseDir, "templates/work-item.example.json"),
    },
    {
      name: "workflow-status",
      schemaPath: path.join(baseDir, "schemas/workflow-status.schema.json"),
      examplePath: path.join(baseDir, "templates/workflow-status.example.json"),
    },
  ];

  return targets.map((target) => {
    const schema = readJson(target.schemaPath);
    const example = readJson(target.examplePath);

    return {
      ...target,
      errors: validateKnownShape(schema, example),
    };
  });
}
