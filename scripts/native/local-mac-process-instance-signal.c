#include <CommonCrypto/CommonDigest.h>
#include <bsm/libbsm.h>
#include <errno.h>
#include <fcntl.h>
#include <libproc.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static int parse_int(const char *source, long long minimum, long long maximum, long long *value) {
  char *end = NULL;
  errno = 0;
  long long parsed = strtoll(source, &end, 10);
  if (errno != 0 || end == source || *end != '\0' || parsed < minimum || parsed > maximum) return 0;
  *value = parsed;
  return 1;
}

static int sha256_file(const char *path, char output[65]) {
  int fd = open(path, O_RDONLY | O_NOFOLLOW);
  if (fd < 0) return 0;
  CC_SHA256_CTX context;
  if (CC_SHA256_Init(&context) != 1) return 0;
  unsigned char buffer[64 * 1024], digest[CC_SHA256_DIGEST_LENGTH];
  for (;;) {
    ssize_t count = read(fd, buffer, sizeof(buffer));
    if (count == 0) break;
    if (count < 0) { if (errno == EINTR) continue; close(fd); return 0; }
    if (CC_SHA256_Update(&context, buffer, (CC_LONG)count) != 1) { close(fd); return 0; }
  }
  if (close(fd) != 0 || CC_SHA256_Final(digest, &context) != 1) return 0;
  static const char alphabet[] = "0123456789abcdef";
  for (size_t index = 0; index < sizeof(digest); index += 1) {
    output[index * 2] = alphabet[digest[index] >> 4];
    output[index * 2 + 1] = alphabet[digest[index] & 15];
  }
  output[64] = '\0';
  return 1;
}

static int snapshot(pid_t pid, struct proc_bsdinfo *info, char path[PROC_PIDPATHINFO_MAXSIZE], struct stat *stat, char digest[65]) {
  if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, info, sizeof(*info)) != sizeof(*info) || info->pbi_pid != (uint32_t)pid) return 0;
  if (proc_pidpath(pid, path, PROC_PIDPATHINFO_MAXSIZE) <= 0 || path[0] != '/') return 0;
  if (lstat(path, stat) != 0 || !S_ISREG(stat->st_mode) || S_ISLNK(stat->st_mode)) return 0;
  return sha256_file(path, digest);
}

static int decode_token(const char *source, audit_token_t *token) {
  if (strlen(source) != sizeof(*token) * 2) return 0;
  unsigned char *target = (unsigned char *)token;
  for (size_t index = 0; index < sizeof(*token); index += 1) {
    char pair[3] = {source[index * 2], source[index * 2 + 1], '\0'};
    char *end = NULL;
    long value = strtol(pair, &end, 16);
    if (end != pair + 2 || value < 0 || value > 255) return 0;
    target[index] = (unsigned char)value;
  }
  return 1;
}

int main(int argc, char **argv) {
  if (argc != 15 || strcmp(argv[1], "signal") != 0) return 64;
  long long pid_value = 0;
  if (!parse_int(argv[2], 1, INT32_MAX, &pid_value)) return 65;
  pid_t pid = (pid_t)pid_value;
  struct proc_bsdinfo info = {0};
  struct stat stat = {0};
  char path[PROC_PIDPATHINFO_MAXSIZE] = {0}, digest[65] = {0};
  if (!snapshot(pid, &info, path, &stat, digest)) return 66;
  long long expected_pidversion, expected_sec, expected_usec, expected_dev, expected_ino;
  long long expected_size, expected_ctime_sec, expected_ctime_nsec, signal_value;
  if (!parse_int(argv[3], 1, UINT32_MAX, &expected_pidversion)
      || !parse_int(argv[4], 0, INT64_MAX, &expected_sec)
      || !parse_int(argv[5], 0, 999999, &expected_usec)
      || !parse_int(argv[7], 0, INT64_MAX, &expected_dev)
      || !parse_int(argv[8], 0, INT64_MAX, &expected_ino)
      || !parse_int(argv[9], 0, INT64_MAX, &expected_size)
      || !parse_int(argv[10], 0, INT64_MAX, &expected_ctime_sec)
      || !parse_int(argv[11], 0, 999999999, &expected_ctime_nsec)
      || !parse_int(argv[14], 1, 31, &signal_value)) return 68;
  audit_token_t token = {0};
  if (!decode_token(argv[13], &token)) return 68;
  if (audit_token_to_pid(token) != pid || audit_token_to_pidversion(token) != expected_pidversion
      || info.pbi_start_tvsec != (uint64_t)expected_sec
      || info.pbi_start_tvusec != (uint64_t)expected_usec
      || strcmp(path, argv[6]) != 0
      || stat.st_dev != (dev_t)expected_dev || stat.st_ino != (ino_t)expected_ino
      || stat.st_size != (off_t)expected_size || stat.st_ctimespec.tv_sec != expected_ctime_sec
      || stat.st_ctimespec.tv_nsec != expected_ctime_nsec || strcmp(digest, argv[12]) != 0) return 69;
  if (proc_signal_with_audittoken(&token, (int)signal_value) != 0) return errno == ESRCH ? 0 : 70;
  return 0;
}
