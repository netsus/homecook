import { existsSync, readdirSync, readFileSync } from "node:fs";
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

function normalizeStringArray(values) {
  return [...values].sort();
}

export function validateWorkflowV2TrackedState({ rootDir = process.cwd() } = {}) {
  const workflowDir = path.join(rootDir, ".workflow-v2");
  if (!existsSync(workflowDir)) {
    return [];
  }

  const workItemSchema = readJson(
    path.join(rootDir, "docs/engineering/workflow-v2/schemas/work-item.schema.json"),
  );
  const statusSchema = readJson(
    path.join(rootDir, "docs/engineering/workflow-v2/schemas/workflow-status.schema.json"),
  );
  const workItemsDir = path.join(workflowDir, "work-items");
  const statusPath = path.join(workflowDir, "status.json");
  const results = [];

  const workItemFiles = existsSync(workItemsDir)
    ? readdirSync(workItemsDir)
        .filter((name) => name.endsWith(".json"))
        .map((name) => path.join(workItemsDir, name))
    : [];

  const workItems = workItemFiles.map((filePath) => {
    const data = readJson(filePath);
    const errors = validateKnownShape(workItemSchema, data);
    results.push({
      name: `tracked-work-item:${path.basename(filePath)}`,
      errors,
    });
    return data;
  });

  if (!existsSync(statusPath)) {
    results.push({
      name: "tracked-status",
      errors: [
        {
          path: ".workflow-v2.status.json",
          message: "Missing .workflow-v2/status.json",
        },
      ],
    });
    return results;
  }

  const statusData = readJson(statusPath);
  const statusErrors = validateKnownShape(statusSchema, statusData);
  const crossErrors = [];

  const workItemsById = new Map(workItems.map((item) => [item.id, item]));
  const statusItems = Array.isArray(statusData.items) ? statusData.items : [];

  for (const statusItem of statusItems) {
    const workItem = workItemsById.get(statusItem.id);
    if (!workItem) {
      crossErrors.push({
        path: `.workflow-v2/status.json.items.${statusItem.id}`,
        message: `Missing matching work item for status entry '${statusItem.id}'.`,
      });
      continue;
    }

    if (statusItem.preset !== workItem.preset) {
      crossErrors.push({
        path: `.workflow-v2/status.json.items.${statusItem.id}.preset`,
        message: `Preset mismatch with work item '${statusItem.id}'.`,
      });
    }

    const statusChecks = Array.isArray(statusItem.required_checks) ? statusItem.required_checks : [];
    const workItemChecks = Array.isArray(workItem.verification?.required_checks)
      ? workItem.verification.required_checks
      : [];

    if (JSON.stringify(normalizeStringArray(statusChecks)) !== JSON.stringify(normalizeStringArray(workItemChecks))) {
      crossErrors.push({
        path: `.workflow-v2/status.json.items.${statusItem.id}.required_checks`,
        message: `Required checks mismatch with work item '${statusItem.id}'.`,
      });
    }
  }

  for (const workItem of workItems) {
    const found = statusItems.some((statusItem) => statusItem.id === workItem.id);
    if (!found) {
      crossErrors.push({
        path: `.workflow-v2/work-items/${workItem.id}.json`,
        message: `Missing matching status entry for work item '${workItem.id}'.`,
      });
    }
  }

  results.push({
    name: "tracked-status",
    errors: [...statusErrors, ...crossErrors],
  });

  return results;
}

export function validateWorkflowV2Bundle({ rootDir = process.cwd() } = {}) {
  return [...validateWorkflowV2Examples({ rootDir }), ...validateWorkflowV2TrackedState({ rootDir })];
}
