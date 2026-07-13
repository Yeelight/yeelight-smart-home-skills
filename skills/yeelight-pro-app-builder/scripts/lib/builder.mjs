import { inspectCapabilities } from "./capability-inspector.mjs";
import { compileApplication } from "./compiler.mjs";
import { compileProductSpec } from "./product-spec.mjs";
import { discoverRuntimeModel } from "./runtime-discovery.mjs";
import { projectManagementCapabilityProfile } from "./management-operations.mjs";
import { projectInfrastructureCapabilityProfile } from "./infrastructure-operations.mjs";

export async function buildApp({ request, title, name, choices = {}, outputRoot, run, capabilityProfile }) {
  if (!outputRoot) throw new Error("buildApp requires outputRoot");
  const spec = compileProductSpec({ request, title, name, choices });
  const model = await discoverRuntimeModel({ spec, run });
  const snapshot = await inspectCapabilities({ spec, ...model, run });
  const selected = spec.modules.map((module) => module.id);
  const capabilities = {
    ...projectManagementCapabilityProfile(selected, capabilityProfile),
    ...projectInfrastructureCapabilityProfile(selected, capabilityProfile),
  };
  if (Object.keys(capabilities).length > 0) snapshot.capabilities = capabilities;
  const compilation = compileApplication({ spec, snapshot, outputRoot });
  return { spec, snapshot, compilation };
}
