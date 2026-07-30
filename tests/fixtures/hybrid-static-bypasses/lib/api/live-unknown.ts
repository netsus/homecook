declare function readCapability(): (paths: string[]) => unknown;

function safeRemove(_paths: string[]) {
  void _paths;
}

export let remove = safeRemove;
remove = readCapability();
