#include <CommonCrypto/CommonDigest.h>
#include <bsm/libbsm.h>
#include <errno.h>
#include <fcntl.h>
#include <libproc.h>
#include <mach/mach.h>
#include <node_api.h>
#include <sandbox.h>
#include <servers/bootstrap.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/proc.h>
#include <unistd.h>

typedef struct {
  char *builtin;
  unsigned char *data;
  size_t size;
} *sandbox_profile_t;

typedef struct {
  const char **params;
  size_t size;
  size_t available;
} *sandbox_params_t;

extern sandbox_params_t sandbox_create_params(void);
extern void sandbox_free_params(sandbox_params_t);
extern sandbox_profile_t sandbox_compile_string(const char *, sandbox_params_t,
                                                char **);
extern void sandbox_free_profile(sandbox_profile_t);
extern int sandbox_apply(sandbox_profile_t);

static int process_attempt_fd = -1;
static int sandbox_initialized = 0;

typedef struct {
  pid_t pid;
  audit_token_t token;
  int active;
} owned_process_instance_t;

static owned_process_instance_t owned_process_instances[16] = {0};

static void reject_witness(void) { _exit(125); }

static int parse_fd(const char *name) {
  const char *source = getenv(name);
  if (source == NULL || *source == '\0')
    reject_witness();
  char *end = NULL;
  errno = 0;
  long value = strtol(source, &end, 10);
  if (errno != 0 || end == source || *end != '\0' || value < 3 || value > 1024)
    reject_witness();
  return (int)value;
}

static char *read_profile(int fd) {
  size_t capacity = 4096;
  size_t length = 0;
  char *buffer = malloc(capacity);
  if (buffer == NULL)
    reject_witness();
  for (;;) {
    if (length == capacity) {
      if (capacity >= 1024 * 1024)
        reject_witness();
      capacity *= 2;
      char *next = realloc(buffer, capacity);
      if (next == NULL)
        reject_witness();
      buffer = next;
    }
    ssize_t count = read(fd, buffer + length, capacity - length);
    if (count == 0)
      break;
    if (count < 0) {
      if (errno == EINTR)
        continue;
      reject_witness();
    }
    length += (size_t)count;
  }
  if (length == 0 || length >= 1024 * 1024)
    reject_witness();
  char *terminated = realloc(buffer, length + 1);
  if (terminated == NULL)
    reject_witness();
  terminated[length] = '\0';
  return terminated;
}

static void sha256_file(const char *path,
                        unsigned char digest[CC_SHA256_DIGEST_LENGTH]) {
  int fd = open(path, O_RDONLY | O_NOFOLLOW);
  if (fd < 0)
    reject_witness();
  CC_SHA256_CTX context;
  if (CC_SHA256_Init(&context) != 1)
    reject_witness();
  unsigned char buffer[64 * 1024];
  for (;;) {
    ssize_t count = read(fd, buffer, sizeof(buffer));
    if (count == 0)
      break;
    if (count < 0) {
      if (errno == EINTR)
        continue;
      reject_witness();
    }
    if (CC_SHA256_Update(&context, buffer, (CC_LONG)count) != 1)
      reject_witness();
  }
  if (close(fd) != 0 || CC_SHA256_Final(digest, &context) != 1)
    reject_witness();
}

static void verify_executable_mapping(pid_t pid, const char *path,
                                      const struct stat *path_stat) {
  uint64_t address = 0;
  int matches = 0;
  struct vinfo_stat mapped = {0};
  for (size_t index = 0; index < 131072; index += 1) {
    struct proc_regionwithpathinfo region = {0};
    int count = proc_pidinfo(pid, PROC_PIDREGIONPATHINFO, address, &region,
                             sizeof(region));
    if (count == 0)
      break;
    if (count != sizeof(region) || region.prp_prinfo.pri_size == 0)
      reject_witness();
    uint64_t next = region.prp_prinfo.pri_address + region.prp_prinfo.pri_size;
    if (next <= address)
      reject_witness();
    address = next;
    if ((region.prp_prinfo.pri_protection & VM_PROT_EXECUTE) == 0 ||
        strcmp(region.prp_vip.vip_path, path) != 0)
      continue;
    const struct vinfo_stat current = region.prp_vip.vip_vi.vi_stat;
    if (matches == 0)
      mapped = current;
    else if (current.vst_dev != mapped.vst_dev ||
             current.vst_ino != mapped.vst_ino ||
             current.vst_size != mapped.vst_size ||
             current.vst_ctime != mapped.vst_ctime ||
             current.vst_ctimensec != mapped.vst_ctimensec)
      reject_witness();
    matches += 1;
  }
  if (matches == 0 || mapped.vst_dev != (uint32_t)path_stat->st_dev ||
      mapped.vst_ino != (uint64_t)path_stat->st_ino ||
      mapped.vst_size != path_stat->st_size ||
      mapped.vst_ctime != path_stat->st_ctimespec.tv_sec ||
      mapped.vst_ctimensec != path_stat->st_ctimespec.tv_nsec)
    reject_witness();
}

static void hex_encode(const unsigned char *source, size_t length,
                       char *target) {
  static const char alphabet[] = "0123456789abcdef";
  for (size_t index = 0; index < length; index += 1) {
    target[index * 2] = alphabet[source[index] >> 4];
    target[index * 2 + 1] = alphabet[source[index] & 0x0f];
  }
  target[length * 2] = '\0';
}

static int controller_sha256_file(const char *path, char output[65]) {
  int fd = open(path, O_RDONLY | O_NOFOLLOW);
  if (fd < 0) return 0;
  CC_SHA256_CTX context;
  if (CC_SHA256_Init(&context) != 1) { close(fd); return 0; }
  unsigned char buffer[64 * 1024], digest[CC_SHA256_DIGEST_LENGTH];
  for (;;) {
    ssize_t count = read(fd, buffer, sizeof(buffer));
    if (count == 0) break;
    if (count < 0) {
      if (errno == EINTR) continue;
      close(fd);
      return 0;
    }
    if (CC_SHA256_Update(&context, buffer, (CC_LONG)count) != 1) {
      close(fd);
      return 0;
    }
  }
  if (close(fd) != 0 || CC_SHA256_Final(digest, &context) != 1) return 0;
  hex_encode(digest, sizeof(digest), output);
  return 1;
}

static int task_audit_token_for_pid(pid_t pid, audit_token_t *token) {
  mach_port_t task = MACH_PORT_NULL;
  kern_return_t result = task_name_for_pid(mach_task_self(), pid, &task);
  if (result != KERN_SUCCESS || task == MACH_PORT_NULL) return 0;
  mach_msg_type_number_t count = TASK_AUDIT_TOKEN_COUNT;
  result = task_info(task, TASK_AUDIT_TOKEN, (task_info_t)token, &count);
  mach_port_deallocate(mach_task_self(), task);
  return result == KERN_SUCCESS && count == TASK_AUDIT_TOKEN_COUNT
      && audit_token_to_pid(*token) == pid
      && audit_token_to_pidversion(*token) > 0;
}

static owned_process_instance_t *find_owned_process(pid_t pid) {
  for (size_t index = 0; index < 16; index += 1) {
    if (owned_process_instances[index].active && owned_process_instances[index].pid == pid)
      return &owned_process_instances[index];
  }
  return NULL;
}

static int remember_owned_process(pid_t pid, const audit_token_t *token) {
  owned_process_instance_t *existing = find_owned_process(pid);
  if (existing != NULL) return memcmp(&existing->token, token, sizeof(*token)) == 0;
  for (size_t index = 0; index < 16; index += 1) {
    if (!owned_process_instances[index].active) {
      owned_process_instances[index].pid = pid;
      owned_process_instances[index].token = *token;
      owned_process_instances[index].active = 1;
      return 1;
    }
  }
  return 0;
}

static void set_named_int64(napi_env env, napi_value object, const char *name, int64_t value) {
  napi_value property = NULL;
  if (napi_create_int64(env, value, &property) != napi_ok
      || napi_set_named_property(env, object, name, property) != napi_ok) reject_witness();
}

static void set_named_string(napi_env env, napi_value object, const char *name, const char *value) {
  napi_value property = NULL;
  if (napi_create_string_utf8(env, value, NAPI_AUTO_LENGTH, &property) != napi_ok
      || napi_set_named_property(env, object, name, property) != napi_ok) reject_witness();
}

static napi_value capture_stopped_process_instance(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {0};
  int32_t pid_value = 0;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc != 1
      || napi_get_value_int32(env, argv[0], &pid_value) != napi_ok || pid_value <= 0)
    reject_witness();
  pid_t pid = (pid_t)pid_value;
  struct proc_bsdinfo process_info = {0};
  audit_token_t token = {0};
  char executable_path[PROC_PIDPATHINFO_MAXSIZE] = {0};
  struct stat executable_stat = {0};
  char executable_digest[65] = {0};
  if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &process_info, sizeof(process_info)) != sizeof(process_info)
      || process_info.pbi_pid != (uint32_t)pid || process_info.pbi_status != SSTOP
      || !task_audit_token_for_pid(pid, &token)
      || proc_pidpath_audittoken(&token, executable_path, sizeof(executable_path)) <= 0
      || executable_path[0] != '/'
      || lstat(executable_path, &executable_stat) != 0
      || !S_ISREG(executable_stat.st_mode) || S_ISLNK(executable_stat.st_mode)
      || !controller_sha256_file(executable_path, executable_digest)) {
    napi_value unavailable = NULL;
    if (napi_get_null(env, &unavailable) != napi_ok) reject_witness();
    return unavailable;
  }
  if (!remember_owned_process(pid, &token)) reject_witness();
  char audit_token_hex[sizeof(token) * 2 + 1] = {0};
  hex_encode((const unsigned char *)&token, sizeof(token), audit_token_hex);
  napi_value result = NULL;
  if (napi_create_object(env, &result) != napi_ok) reject_witness();
  set_named_int64(env, result, "pid", pid);
  set_named_int64(env, result, "ppid", process_info.pbi_ppid);
  set_named_int64(env, result, "pgid", process_info.pbi_pgid);
  set_named_int64(env, result, "pidversion", audit_token_to_pidversion(token));
  set_named_int64(env, result, "started_at_sec", process_info.pbi_start_tvsec);
  set_named_int64(env, result, "started_at_usec", process_info.pbi_start_tvusec);
  set_named_string(env, result, "process_name", process_info.pbi_name[0] == '\0'
      ? process_info.pbi_comm : process_info.pbi_name);
  set_named_string(env, result, "execution_audit_token", audit_token_hex);
  set_named_string(env, result, "executable_path", executable_path);
  set_named_string(env, result, "device", "");
  set_named_string(env, result, "inode", "");
  set_named_int64(env, result, "size", executable_stat.st_size);
  set_named_int64(env, result, "ctime_sec", executable_stat.st_ctimespec.tv_sec);
  set_named_int64(env, result, "ctime_nsec", executable_stat.st_ctimespec.tv_nsec);
  set_named_string(env, result, "executable_sha256", executable_digest);
  char device[32] = {0}, inode[32] = {0};
  snprintf(device, sizeof(device), "%llu", (unsigned long long)executable_stat.st_dev);
  snprintf(inode, sizeof(inode), "%llu", (unsigned long long)executable_stat.st_ino);
  set_named_string(env, result, "device", device);
  set_named_string(env, result, "inode", inode);
  return result;
}

static napi_value signal_owned_process_instance(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2] = {0};
  int32_t pid = 0, signal_number = 0;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc != 2
      || napi_get_value_int32(env, argv[0], &pid) != napi_ok || pid <= 0
      || napi_get_value_int32(env, argv[1], &signal_number) != napi_ok) {
    napi_throw_error(env, NULL, "invalid owned process signal arguments");
    return NULL;
  }
  if (signal_number != SIGCONT && signal_number != SIGTERM && signal_number != SIGKILL)
    { napi_throw_error(env, NULL, "invalid owned process signal"); return NULL; }
  owned_process_instance_t *owned = find_owned_process((pid_t)pid);
  if (owned == NULL) { napi_throw_error(env, NULL, "owned process instance is unavailable"); return NULL; }
  int sent = proc_signal_with_audittoken(&owned->token, signal_number) == 0;
  if (!sent && errno != ESRCH) {
    napi_throw_error(env, NULL, "audit-token process signal failed");
    return NULL;
  }
  napi_value result = NULL;
  if (napi_get_boolean(env, sent, &result) != napi_ok) reject_witness();
  return result;
}

static napi_value abort_stopped_direct_child(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {0};
  int32_t pid = 0;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc != 1
      || napi_get_value_int32(env, argv[0], &pid) != napi_ok || pid <= 0) {
    napi_throw_error(env, NULL, "invalid stopped child abort arguments");
    return NULL;
  }
  struct proc_bsdinfo process_info = {0};
  int exact_stopped_child = proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &process_info,
                                         sizeof(process_info)) == sizeof(process_info)
      && process_info.pbi_pid == (uint32_t)pid
      && process_info.pbi_ppid == (uint32_t)getpid()
      && process_info.pbi_status == SSTOP;
  int sent = exact_stopped_child && kill((pid_t)pid, SIGKILL) == 0;
  if (!sent && errno != ESRCH) {
    napi_throw_error(env, NULL, "stopped direct child abort failed closed");
    return NULL;
  }
  napi_value result = NULL;
  if (napi_get_boolean(env, sent, &result) != napi_ok) reject_witness();
  return result;
}

static napi_value release_owned_process_instance(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {0};
  int32_t pid = 0;
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok || argc != 1
      || napi_get_value_int32(env, argv[0], &pid) != napi_ok || pid <= 0) reject_witness();
  owned_process_instance_t *owned = find_owned_process((pid_t)pid);
  if (owned != NULL) memset(owned, 0, sizeof(*owned));
  napi_value result = NULL;
  if (napi_get_undefined(env, &result) != napi_ok) reject_witness();
  return result;
}

static void write_json_string(int fd, const char *source) {
  if (dprintf(fd, "\"") < 0)
    reject_witness();
  for (const unsigned char *cursor = (const unsigned char *)source;
       *cursor != '\0'; cursor += 1) {
    if (*cursor == '\\' || *cursor == '\"') {
      if (dprintf(fd, "\\%c", *cursor) < 0)
        reject_witness();
    } else if (*cursor < 0x20) {
      if (dprintf(fd, "\\u%04x", *cursor) < 0)
        reject_witness();
    } else if (write(fd, cursor, 1) != 1) {
      reject_witness();
    }
  }
  if (dprintf(fd, "\"") < 0)
    reject_witness();
}

static napi_value record_process_attempt(napi_env env,
                                         napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {0};
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok ||
      argc != 1)
    reject_witness();
  char kind[64] = {0};
  size_t length = 0;
  if (napi_get_value_string_utf8(env, argv[0], kind, sizeof(kind), &length) !=
          napi_ok ||
      length == 0 || length >= sizeof(kind))
    reject_witness();
  for (size_t index = 0; index < length; index += 1) {
    if (!((kind[index] >= 'a' && kind[index] <= 'z') ||
          (kind[index] >= 'A' && kind[index] <= 'Z')))
      reject_witness();
  }
  if (process_attempt_fd < 0 ||
      dprintf(process_attempt_fd, "{\"process_attempt\":\"%s\"}\n", kind) < 0)
    reject_witness();
  napi_value result = NULL;
  if (napi_get_undefined(env, &result) != napi_ok)
    reject_witness();
  return result;
}

static napi_value lookup_mach_service(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {0};
  if (napi_get_cb_info(env, info, &argc, argv, NULL, NULL) != napi_ok ||
      argc != 1)
    reject_witness();
  char name[256] = {0};
  size_t length = 0;
  if (napi_get_value_string_utf8(env, argv[0], name, sizeof(name), &length) !=
          napi_ok ||
      length == 0 || length >= sizeof(name))
    reject_witness();
  if (strcmp(name, "com.apple.diagnosticd") != 0 &&
      strcmp(name, "com.apple.SystemConfiguration.DNSConfiguration") != 0 &&
      dprintf(process_attempt_fd, "{\"process_attempt\":\"machLookup\"}\n") <
          0) {
    reject_witness();
  }
  mach_port_t service = MACH_PORT_NULL;
  kern_return_t result = bootstrap_look_up(bootstrap_port, name, &service);
  if (service != MACH_PORT_NULL)
    mach_port_deallocate(mach_task_self(), service);
  napi_value value = NULL;
  if (napi_create_int32(env, result, &value) != napi_ok)
    reject_witness();
  return value;
}

NAPI_MODULE_INIT() {
  const char *profile_source = getenv("HOMECOOK_SANDBOX_PROFILE_FD");
  const char *witness_source = getenv("HOMECOOK_SANDBOX_WITNESS_FD");
  const char *worker_source = getenv("HOMECOOK_SANDBOX_WORKER_THREAD");
  if ((profile_source == NULL) != (witness_source == NULL)) reject_witness();
  if (profile_source == NULL && worker_source == NULL) {
    napi_value capture_function = NULL, signal_function = NULL, abort_function = NULL, release_function = NULL;
    if (napi_create_function(env, "captureStoppedProcessInstance", NAPI_AUTO_LENGTH,
                             capture_stopped_process_instance, NULL, &capture_function) != napi_ok
        || napi_set_named_property(env, exports, "captureStoppedProcessInstance", capture_function) != napi_ok
        || napi_create_function(env, "signalOwnedProcessInstance", NAPI_AUTO_LENGTH,
                                signal_owned_process_instance, NULL, &signal_function) != napi_ok
        || napi_set_named_property(env, exports, "signalOwnedProcessInstance", signal_function) != napi_ok
        || napi_create_function(env, "abortStoppedDirectChild", NAPI_AUTO_LENGTH,
                                abort_stopped_direct_child, NULL, &abort_function) != napi_ok
        || napi_set_named_property(env, exports, "abortStoppedDirectChild", abort_function) != napi_ok
        || napi_create_function(env, "releaseOwnedProcessInstance", NAPI_AUTO_LENGTH,
                                release_owned_process_instance, NULL, &release_function) != napi_ok
        || napi_set_named_property(env, exports, "releaseOwnedProcessInstance", release_function) != napi_ok)
      reject_witness();
    return exports;
  }
  if (profile_source == NULL && strcmp(worker_source, "1") != 0) reject_witness();
  if (!sandbox_initialized) {
    int profile_fd = parse_fd("HOMECOOK_SANDBOX_PROFILE_FD");
    int witness_fd = parse_fd("HOMECOOK_SANDBOX_WITNESS_FD");
    process_attempt_fd = witness_fd;
    if (raise(SIGSTOP) != 0) reject_witness();
    char *profile_source = read_profile(profile_fd);
    if (close(profile_fd) != 0)
      reject_witness();

    sandbox_params_t params = sandbox_create_params();
    if (params == NULL)
      reject_witness();
    char *sandbox_error = NULL;
    sandbox_profile_t profile =
        sandbox_compile_string(profile_source, params, &sandbox_error);
    sandbox_free_params(params);
    free(profile_source);
    if (profile == NULL || sandbox_error != NULL)
      reject_witness();
    if (sandbox_apply(profile) != 0)
      reject_witness();
    sandbox_free_profile(profile);

    audit_token_t token = {0};
    mach_msg_type_number_t token_count = TASK_AUDIT_TOKEN_COUNT;
    if (task_info(mach_task_self(), TASK_AUDIT_TOKEN, (task_info_t)&token,
                  &token_count) != KERN_SUCCESS ||
        token_count != TASK_AUDIT_TOKEN_COUNT)
      reject_witness();
    pid_t pid = audit_token_to_pid(token);
    int pidversion = audit_token_to_pidversion(token);
    if (pid != getpid() || pidversion <= 0)
      reject_witness();

    char executable_path[PROC_PIDPATHINFO_MAXSIZE] = {0};
    if (proc_pidpath_audittoken(&token, executable_path,
                                sizeof(executable_path)) <= 0 ||
        executable_path[0] != '/')
      reject_witness();
    struct stat executable_stat = {0};
    if (lstat(executable_path, &executable_stat) != 0 ||
        !S_ISREG(executable_stat.st_mode) || S_ISLNK(executable_stat.st_mode))
      reject_witness();
    verify_executable_mapping(pid, executable_path, &executable_stat);
    struct proc_bsdinfo process_info = {0};
    if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &process_info,
                     sizeof(process_info)) != sizeof(process_info))
      reject_witness();
    if (process_info.pbi_pid != (uint32_t)pid || process_info.pbi_pgid == 0)
      reject_witness();

    unsigned char executable_digest[CC_SHA256_DIGEST_LENGTH] = {0};
    char executable_digest_hex[CC_SHA256_DIGEST_LENGTH * 2 + 1] = {0};
    char audit_token_hex[sizeof(token) * 2 + 1] = {0};
    sha256_file(executable_path, executable_digest);
    hex_encode(executable_digest, sizeof(executable_digest),
               executable_digest_hex);
    hex_encode((const unsigned char *)&token, sizeof(token), audit_token_hex);

    if (dprintf(witness_fd,
                "{\"pid\":%d,\"ppid\":%u,\"pgid\":%u,\"pidversion\":%d,"
                "\"started_at_sec\":%llu,\"started_at_usec\":%llu,\"process_"
                "name\":",
                pid, process_info.pbi_ppid, process_info.pbi_pgid, pidversion,
                process_info.pbi_start_tvsec,
                process_info.pbi_start_tvusec) < 0)
      reject_witness();
    write_json_string(witness_fd, process_info.pbi_name[0] == '\0'
                                      ? process_info.pbi_comm
                                      : process_info.pbi_name);
    if (dprintf(witness_fd,
                ",\"execution_audit_token\":\"%s\",\"executable_path\":",
                audit_token_hex) < 0)
      reject_witness();
    write_json_string(witness_fd, executable_path);
    if (dprintf(witness_fd,
                ",\"device\":\"%llu\",\"inode\":\"%llu\",\"size\":\"%lld\","
                "\"ctime_sec\":%lld,\"ctime_nsec\":%ld,\"executable_sha256\":"
                "\"%s\"}\n",
                (unsigned long long)executable_stat.st_dev,
                (unsigned long long)executable_stat.st_ino,
                (long long)executable_stat.st_size,
                (long long)executable_stat.st_ctimespec.tv_sec,
                executable_stat.st_ctimespec.tv_nsec,
                executable_digest_hex) < 0)
      reject_witness();
    unsetenv("HOMECOOK_SANDBOX_PROFILE_FD");
    unsetenv("HOMECOOK_SANDBOX_WITNESS_FD");
    sandbox_initialized = 1;
  }
  napi_value record_function = NULL;
  napi_value lookup_function = NULL;
  if (napi_create_function(env, "recordProcessAttempt", NAPI_AUTO_LENGTH,
                           record_process_attempt, NULL,
                           &record_function) != napi_ok ||
      napi_set_named_property(env, exports, "recordProcessAttempt",
                              record_function) != napi_ok ||
      napi_create_function(env, "lookupMachService", NAPI_AUTO_LENGTH,
                           lookup_mach_service, NULL,
                           &lookup_function) != napi_ok ||
      napi_set_named_property(env, exports, "lookupMachService",
                              lookup_function) != napi_ok) {
    reject_witness();
  }
  return exports;
}
