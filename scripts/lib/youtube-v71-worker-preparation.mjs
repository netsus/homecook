import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import {
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE,
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
  buildYoutubeExtractionCurrentPolicy,
  buildYoutubeExtractionWorkerPolicySnapshotDigest,
  ensureAbsolutePath,
  readJsonFile,
  sha256File,
  stableStringify,
  verifyYoutubeExtractionWorkerArtifact,
} from "./youtube-extraction-worker-artifact.mjs";

export const YOUTUBE_V71_RELEASE_SHA =
  "8e515a6482a1dfaa292d6f67ae6aa8a06f84d2d4";
export const YOUTUBE_V71_RELEASE_TREE =
  "32337e7d09d76140f7c73855ae2ab648fefa6e7f";
export const YOUTUBE_V71_BUILD_ID = "youtube-integrated-8e515a6482a1";
export const YOUTUBE_V71_PROMOTION_ID = "youtube-integrated-20261013-v71";
export const YOUTUBE_V71_SCHEMA_IDENTITY =
  "youtube-extraction-worker-schema-v2";
export const YOUTUBE_V71_POLICY_VERSION = 3;
export const YOUTUBE_V71_PIPELINE_IDENTITY =
  "85fbf4877e6f2894841bfd160f2d9a63894eb709fd63e897483efe71fd4016cd";
export const YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST =
  "17577b8be8be9da59d37aee80c4467e09fc27b8398a547f63497760c774dc6d7";
export const YOUTUBE_V71_ARTIFACT_IDENTITY =
  "5c391bf5e73ee345052e20e66194b8eefa7b214f18c3b7b7fd10718e4e0723ea";
export const YOUTUBE_V71_ARTIFACT_MANIFEST_FILE_SHA256 =
  "5ccf1e4dd4c8019f65a4f31592891286911150ffde0fbe7cbd8e85ee50a89ed0";
export const YOUTUBE_V71_APP_DESCRIPTOR_FILE_SHA256 =
  "ead032f1916f8069e87c6b7b78e2e80ee736883db9a1605ea040a7c245c584f7";
export const YOUTUBE_V71_EXPECTED_SCHEMA_SHA256 =
  "d728e154663c05677eba4b5b4cfc578036707e8c70d1bee823dbca1ef4ee3fad";
export const YOUTUBE_V71_CREDENTIAL_GENERATION_BEFORE = 46;
export const YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER = 47;
export const YOUTUBE_V71_CREDENTIAL_TTL_SECONDS = 6 * 24 * 60 * 60;
export const YOUTUBE_V71_MANAGER_MAX_TTL_SECONDS = 5 * 60;

const PREDECESSOR = Object.freeze({
  release_sha: "c51d53871f31c7840fe24792b46b191ca963b11b",
  credential_generation: YOUTUBE_V71_CREDENTIAL_GENERATION_BEFORE,
  pipeline_identity:
    "1c9c47074da3bf1c55ed83f1ba5131d9d48ad486503919c554a5530d7972d935",
  policy_snapshot_digest:
    "e40c9f4ef0d8a9241e49635f0fc906fe92a20f57a46e005fa4dd308805a191c0",
  observed_expiry: "2026-10-14T17:14:31.000Z",
});

function check(condition, message) {
  if (!condition) throw new Error(`v71 worker preparation rejected: ${message}`);
}

function exactKeys(value, keys, label) {
  check(value && typeof value === "object" && !Array.isArray(value), `${label} shape`);
  check(
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()),
    `${label} keys`,
  );
}

function assertArtifact(manifest) {
  check(manifest.release_sha === YOUTUBE_V71_RELEASE_SHA, "release SHA");
  check(manifest.release_tree === YOUTUBE_V71_RELEASE_TREE, "release tree");
  check(manifest.build_id === YOUTUBE_V71_BUILD_ID, "build ID");
  check(manifest.promotion_id === YOUTUBE_V71_PROMOTION_ID, "promotion ID");
  check(manifest.schema_identity === YOUTUBE_V71_SCHEMA_IDENTITY, "schema identity");
  check(manifest.policy_version === YOUTUBE_V71_POLICY_VERSION, "policy version");
  check(
    manifest.pipeline_identity === YOUTUBE_V71_PIPELINE_IDENTITY,
    "pipeline identity",
  );
  check(
    manifest.allowed_snapshot_digest === YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
    "policy snapshot digest",
  );
  check(
    manifest.artifact_sha256 === YOUTUBE_V71_ARTIFACT_IDENTITY,
    "artifact identity",
  );
  check(
    manifest.expected_schema_sha256 === YOUTUBE_V71_EXPECTED_SCHEMA_SHA256,
    "expected schema digest",
  );
}

function assertDescriptor(descriptor) {
  exactKeys(descriptor, [
    "artifact_sha256",
    "expected_policy_snapshot_digest",
    "expected_policy_version",
    "expected_schema_sha256",
    "release_sha",
    "schema",
    "schema_identity",
    "version",
  ], "app descriptor");
  check(descriptor.schema === "homecook.youtube-extraction-app-descriptor", "descriptor schema");
  check(descriptor.version === 1, "descriptor version");
  check(descriptor.release_sha === YOUTUBE_V71_RELEASE_SHA, "descriptor release SHA");
  check(descriptor.schema_identity === YOUTUBE_V71_SCHEMA_IDENTITY, "descriptor schema identity");
  check(descriptor.expected_policy_version === YOUTUBE_V71_POLICY_VERSION, "descriptor policy version");
  check(
    descriptor.expected_policy_snapshot_digest === YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
    "descriptor policy digest",
  );
  check(descriptor.artifact_sha256 === YOUTUBE_V71_ARTIFACT_IDENTITY, "descriptor artifact identity");
  check(
    descriptor.expected_schema_sha256 === YOUTUBE_V71_EXPECTED_SCHEMA_SHA256,
    "descriptor expected schema digest",
  );
}

export function buildYoutubeV71CandidatePolicy() {
  const computed = buildYoutubeExtractionWorkerPolicySnapshotDigest({
    extractorMode: DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE,
    pipelineIdentity: YOUTUBE_V71_PIPELINE_IDENTITY,
    policyVersion: YOUTUBE_V71_POLICY_VERSION,
    resultAffectingOptions: DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
  });
  check(computed === YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST, "computed policy digest");
  return buildYoutubeExtractionCurrentPolicy({
    policyVersion: YOUTUBE_V71_POLICY_VERSION,
    policySnapshotDigest: computed,
    extractorMode: DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE,
    pipelineIdentity: YOUTUBE_V71_PIPELINE_IDENTITY,
    enabled: true,
  });
}

export function assertYoutubeV71CredentialBinding({ claims, metadata }) {
  exactKeys(metadata, [
    "allowed_snapshot_digest",
    "expires_at",
    "generation",
    "jti_sha256",
    "release_sha",
    "schema_identity",
  ], "credential metadata");
  const requiredClaims = {
    role: "youtube_extraction_worker",
    scope: "youtube-extraction-worker",
    iss: "https://worker.mumeok.kr",
    aud: "youtube-extraction",
    generation: YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER,
    release_sha: YOUTUBE_V71_RELEASE_SHA,
    schema_identity: YOUTUBE_V71_SCHEMA_IDENTITY,
    allowed_snapshot_digest: YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
  };
  for (const [key, value] of Object.entries(requiredClaims)) {
    check(claims?.[key] === value, `credential claim ${key}`);
  }
  check(Number.isSafeInteger(claims.iat), "credential iat");
  check(Number.isSafeInteger(claims.exp), "credential exp");
  check(
    claims.exp - claims.iat === YOUTUBE_V71_CREDENTIAL_TTL_SECONDS,
    "credential six-day lifetime",
  );
  check(metadata.generation === requiredClaims.generation, "metadata generation");
  check(metadata.release_sha === requiredClaims.release_sha, "metadata release SHA");
  check(metadata.schema_identity === requiredClaims.schema_identity, "metadata schema identity");
  check(
    metadata.allowed_snapshot_digest === requiredClaims.allowed_snapshot_digest,
    "metadata policy digest",
  );
  check(metadata.jti_sha256 === claims.jti_hash, "metadata JTI hash");
  check(
    Date.parse(metadata.expires_at) === claims.exp * 1_000,
    "metadata expiry",
  );
  return true;
}

export function buildYoutubeV71PreparationManifest({
  artifactManifestPath,
  appDescriptorPath,
  candidatePolicyPath,
} = {}) {
  const artifactPath = ensureAbsolutePath(artifactManifestPath, "artifactManifestPath");
  const descriptorPath = ensureAbsolutePath(appDescriptorPath, "appDescriptorPath");
  const policyPath = ensureAbsolutePath(candidatePolicyPath, "candidatePolicyPath");
  const artifact = verifyYoutubeExtractionWorkerArtifact(artifactPath);
  assertArtifact(artifact);
  check(
    sha256File(artifactPath) === YOUTUBE_V71_ARTIFACT_MANIFEST_FILE_SHA256,
    "artifact manifest file digest",
  );
  const descriptor = readJsonFile(descriptorPath, "v71 app descriptor", { mode: 0o600 });
  assertDescriptor(descriptor);
  check(
    sha256File(descriptorPath) === YOUTUBE_V71_APP_DESCRIPTOR_FILE_SHA256,
    "app descriptor file digest",
  );
  const candidatePolicy = buildYoutubeV71CandidatePolicy();

  return {
    manifest: {
      schema: "homecook.youtube-v71-worker-preparation.v1",
      version: 1,
      production_mutation_authorized: false,
      production_state: {
        credential_created: false,
        credential_registered: false,
        manager_credential_created: false,
        policy_registered: false,
        queue_or_worker_changed: false,
      },
      predecessor: PREDECESSOR,
      candidate: {
        release_sha: YOUTUBE_V71_RELEASE_SHA,
        release_tree: YOUTUBE_V71_RELEASE_TREE,
        build_id: YOUTUBE_V71_BUILD_ID,
        promotion_id: YOUTUBE_V71_PROMOTION_ID,
        schema_identity: YOUTUBE_V71_SCHEMA_IDENTITY,
        artifact_identity_sha256: YOUTUBE_V71_ARTIFACT_IDENTITY,
        artifact_manifest: {
          path: artifactPath,
          sha256: YOUTUBE_V71_ARTIFACT_MANIFEST_FILE_SHA256,
        },
        app_descriptor: {
          path: descriptorPath,
          sha256: YOUTUBE_V71_APP_DESCRIPTOR_FILE_SHA256,
        },
        candidate_policy: {
          path: policyPath,
          policy_version: YOUTUBE_V71_POLICY_VERSION,
          pipeline_identity: YOUTUBE_V71_PIPELINE_IDENTITY,
          snapshot_digest: YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
          result_affecting_options: DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
        },
        credential: {
          expected_generation_before: YOUTUBE_V71_CREDENTIAL_GENERATION_BEFORE,
          generation: YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER,
          ttl_seconds: YOUTUBE_V71_CREDENTIAL_TTL_SECONDS,
          issued: false,
          expires_at: null,
        },
        credential_manager: {
          role: "youtube_extraction_credential_manager",
          scope: "youtube-extraction-credential-manager",
          issuer: "https://worker.mumeok.kr",
          audience: "youtube-extraction",
          maximum_ttl_seconds: YOUTUBE_V71_MANAGER_MAX_TTL_SECONDS,
          created: false,
          used_for_registration: false,
        },
      },
      cutover_requirements: [
        "Obtain exact approval for the v71 policy, generation-47 credential, and worker cutover.",
        "Freeze enqueue, drain queued and processing jobs, confirm no permit holder, then stop generation 46.",
        "Create the six-day generation-47 worker credential and a separate manager JWT valid for at most five minutes with only the credential-rotation RPC role and scope.",
        "Back up the credential row, current policy row, and predecessor plist before the database transition.",
        "Register the v71 policy and compare-and-swap generation 46 to 47 under reviewed database authority.",
        "Install the pinned artifact and verify two stable launchd observations plus an authenticated worker request.",
        "Remove obsolete secret files only after the generation-47 worker is verified.",
      ],
      cutover_effects: {
        generation_46_invalid_immediately_after_registration: true,
        temporary_extraction_outage_expected: true,
        predecessor_plist_only_rollback_sufficient_after_registration: false,
        post_registration_recovery:
          "Keep generation 47 and repair/retry the pinned v71 install, or obtain separate approval to issue generation 48 bound to the predecessor release and restore the predecessor policy.",
      },
    },
    candidatePolicy,
  };
}

export function writeYoutubeV71PreparationFiles({
  artifactManifestPath,
  appDescriptorPath,
  candidatePolicyPath,
  preparationManifestPath,
} = {}) {
  const policyPath = ensureAbsolutePath(candidatePolicyPath, "candidatePolicyPath");
  const manifestPath = ensureAbsolutePath(preparationManifestPath, "preparationManifestPath");
  check(policyPath !== manifestPath, "output paths must be distinct");
  check(!existsSync(policyPath), "candidate policy output already exists");
  check(!existsSync(manifestPath), "preparation manifest output already exists");
  const prepared = buildYoutubeV71PreparationManifest({
    artifactManifestPath,
    appDescriptorPath,
    candidatePolicyPath: policyPath,
  });
  mkdirSync(dirname(policyPath), { recursive: true, mode: 0o700 });
  mkdirSync(dirname(manifestPath), { recursive: true, mode: 0o700 });
  const createdPaths = [];
  const descriptors = [];
  try {
    const policyDescriptor = openSync(policyPath, "wx", 0o600);
    createdPaths.push(policyPath);
    descriptors.push(policyDescriptor);
    const manifestDescriptor = openSync(manifestPath, "wx", 0o600);
    createdPaths.push(manifestPath);
    descriptors.push(manifestDescriptor);
    writeFileSync(policyDescriptor, `${stableStringify(prepared.candidatePolicy)}\n`, "utf8");
    fsyncSync(policyDescriptor);
    writeFileSync(manifestDescriptor, `${stableStringify(prepared.manifest)}\n`, "utf8");
    fsyncSync(manifestDescriptor);
  } catch (error) {
    for (const descriptor of descriptors) {
      try { closeSync(descriptor); } catch { /* preserve the preparation failure */ }
    }
    descriptors.length = 0;
    for (const path of createdPaths.reverse()) {
      try { unlinkSync(path); } catch { /* remove only files created by this call */ }
    }
    throw error;
  } finally {
    for (const descriptor of descriptors) closeSync(descriptor);
  }
  return prepared.manifest;
}
