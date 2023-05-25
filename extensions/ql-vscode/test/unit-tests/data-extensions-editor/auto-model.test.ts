import { createAutoModelRequest } from "../../../src/data-extensions-editor/auto-model";
import { ExternalApiUsage } from "../../../src/data-extensions-editor/external-api-usage";
import { ModeledMethod } from "../../../src/data-extensions-editor/modeled-method";
import {
  createMockDB,
  mockDbOptions,
} from "../../factories/databases/databases";
import * as tmp from "tmp";

describe("createAutoModelRequest", () => {
  const externalApiUsages: ExternalApiUsage[] = [
    {
      signature:
        "org.springframework.boot.SpringApplication#run(Class,String[])",
      packageName: "org.springframework.boot",
      typeName: "SpringApplication",
      methodName: "run",
      methodParameters: "(Class,String[])",
      supported: false,
      usages: [
        {
          label: "run(...)",
          url: {
            uri: "file:/home/runner/work/sql2o-example/sql2o-example/src/main/java/org/example/Sql2oExampleApplication.java",
            startLine: 9,
            startColumn: 9,
            endLine: 9,
            endColumn: 66,
          },
        },
      ],
    },
    {
      signature: "org.sql2o.Connection#createQuery(String)",
      packageName: "org.sql2o",
      typeName: "Connection",
      methodName: "createQuery",
      methodParameters: "(String)",
      supported: true,
      usages: [
        {
          label: "createQuery(...)",
          url: {
            uri: "file:/home/runner/work/sql2o-example/sql2o-example/src/main/java/org/example/HelloController.java",
            startLine: 15,
            startColumn: 13,
            endLine: 15,
            endColumn: 56,
          },
        },
        {
          label: "createQuery(...)",
          url: {
            uri: "file:/home/runner/work/sql2o-example/sql2o-example/src/main/java/org/example/HelloController.java",
            startLine: 26,
            startColumn: 13,
            endLine: 26,
            endColumn: 39,
          },
        },
      ],
    },
    {
      signature: "org.sql2o.Query#executeScalar(Class)",
      packageName: "org.sql2o",
      typeName: "Query",
      methodName: "executeScalar",
      methodParameters: "(Class)",
      supported: true,
      usages: [
        {
          label: "executeScalar(...)",
          url: {
            uri: "file:/home/runner/work/sql2o-example/sql2o-example/src/main/java/org/example/HelloController.java",
            startLine: 15,
            startColumn: 13,
            endLine: 15,
            endColumn: 85,
          },
        },
        {
          label: "executeScalar(...)",
          url: {
            uri: "file:/home/runner/work/sql2o-example/sql2o-example/src/main/java/org/example/HelloController.java",
            startLine: 26,
            startColumn: 13,
            endLine: 26,
            endColumn: 68,
          },
        },
      ],
    },
    {
      signature: "org.sql2o.Sql2o#open()",
      packageName: "org.sql2o",
      typeName: "Sql2o",
      methodName: "open",
      methodParameters: "()",
      supported: true,
      usages: [
        {
          label: "open(...)",
          url: {
            uri: "file:/home/runner/work/sql2o-example/sql2o-example/src/main/java/org/example/HelloController.java",
            startLine: 14,
            startColumn: 24,
            endLine: 14,
            endColumn: 35,
          },
        },
        {
          label: "open(...)",
          url: {
            uri: "file:/home/runner/work/sql2o-example/sql2o-example/src/main/java/org/example/HelloController.java",
            startLine: 25,
            startColumn: 24,
            endLine: 25,
            endColumn: 35,
          },
        },
      ],
    },
    {
      signature: "java.io.PrintStream#println(String)",
      packageName: "java.io",
      typeName: "PrintStream",
      methodName: "println",
      methodParameters: "(String)",
      supported: true,
      usages: [
        {
          label: "println(...)",
          url: {
            uri: "file:/home/runner/work/sql2o-example/sql2o-example/src/main/java/org/example/HelloController.java",
            startLine: 29,
            startColumn: 9,
            endLine: 29,
            endColumn: 49,
          },
        },
      ],
    },
    {
      signature: "org.sql2o.Sql2o#Sql2o(String,String,String)",
      packageName: "org.sql2o",
      typeName: "Sql2o",
      methodName: "Sql2o",
      methodParameters: "(String,String,String)",
      supported: true,
      usages: [
        {
          label: "new Sql2o(...)",
          url: {
            uri: "file:/home/runner/work/sql2o-example/sql2o-example/src/main/java/org/example/HelloController.java",
            startLine: 10,
            startColumn: 33,
            endLine: 10,
            endColumn: 88,
          },
        },
      ],
    },
    {
      signature: "org.sql2o.Sql2o#Sql2o(String)",
      packageName: "org.sql2o",
      typeName: "Sql2o",
      methodName: "Sql2o",
      methodParameters: "(String)",
      supported: true,
      usages: [
        {
          label: "new Sql2o(...)",
          url: {
            uri: "file:/home/runner/work/sql2o-example/sql2o-example/src/main/java/org/example/HelloController.java",
            startLine: 23,
            startColumn: 23,
            endLine: 23,
            endColumn: 36,
          },
        },
      ],
    },
  ];

  let dir: tmp.DirResult;

  const modeledMethods: Record<string, ModeledMethod> = {
    "org.sql2o.Sql2o#open()": {
      type: "neutral",
      kind: "",
      input: "",
      output: "",
    },
    "org.sql2o.Sql2o#Sql2o(String)": {
      type: "sink",
      kind: "jndi-injection",
      input: "Argument[0]",
      output: "",
    },
  };

  beforeEach(() => {
    dir = tmp.dirSync({
      prefix: "auto_model",
      unsafeCleanup: true,
    });
  });

  it("creates a matching request", () => {
    const db = createMockDB(dir, {
      ...mockDbOptions(),
      language: "java",
    });

    expect(
      createAutoModelRequest(db, externalApiUsages, modeledMethods),
    ).toEqual({
      language: "java",
      samples: [
        {
          package: "org.sql2o",
          type: "Sql2o",
          name: "Sql2o",
          signature: "(String)",
          classification: {
            type: "CLASSIFICATION_TYPE_SINK",
            kind: "jndi-injection",
            explanation: "",
          },
          usages: ["new Sql2o(...)"],
          input: "Argument[0]",
        },
      ],
      candidates: [
        {
          package: "org.sql2o",
          type: "Connection",
          name: "createQuery",
          signature: "(String)",
          usages: ["createQuery(...)", "createQuery(...)"],
          input: "Argument[0]",
        },
        {
          package: "org.sql2o",
          type: "Query",
          name: "executeScalar",
          signature: "(Class)",
          usages: ["executeScalar(...)", "executeScalar(...)"],
          input: "Argument[0]",
        },
        {
          package: "org.springframework.boot",
          type: "SpringApplication",
          name: "run",
          signature: "(Class,String[])",
          usages: ["run(...)"],
          input: "Argument[0]",
        },
        {
          package: "org.springframework.boot",
          type: "SpringApplication",
          name: "run",
          signature: "(Class,String[])",
          usages: ["run(...)"],
          input: "Argument[1]",
        },
        {
          package: "java.io",
          type: "PrintStream",
          name: "println",
          signature: "(String)",
          usages: ["println(...)"],
          input: "Argument[0]",
        },
        {
          package: "org.sql2o",
          type: "Sql2o",
          name: "Sql2o",
          signature: "(String,String,String)",
          usages: ["new Sql2o(...)"],
          input: "Argument[0]",
        },
        {
          package: "org.sql2o",
          type: "Sql2o",
          name: "Sql2o",
          signature: "(String,String,String)",
          usages: ["new Sql2o(...)"],
          input: "Argument[1]",
        },
        {
          package: "org.sql2o",
          type: "Sql2o",
          name: "Sql2o",
          signature: "(String,String,String)",
          usages: ["new Sql2o(...)"],
          input: "Argument[2]",
        },
      ],
    });
  });
});
