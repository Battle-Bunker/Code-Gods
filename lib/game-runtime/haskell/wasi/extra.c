/* Code Gods: platform hooks for the MicroHs runtime on wasm32-wasip1 (replaces unix/extra.c).
 * No terminal, no temporary files, no executable path. Time comes from WASI clock_time_get, which
 * the host answers with the virtual clock.
 */
#include <stdint.h>
#include <time.h>
#include <sys/time.h>

#define FFS __builtin_ffs

uintptr_t
gettimemicro(void)
{
  struct timeval tv;
  (void)gettimeofday(&tv, NULL);
  return (uintptr_t)(tv.tv_sec * 1000000 + tv.tv_usec);
}
#define GETTIMEMICRO gettimemicro

#define CLOCK_INIT() do { } while(0)
#define CLOCK_T int64_t
#define CLOCK_GET clock_get
/* No sleeping: a delay returns at once (the clock is virtual). */
#define CLOCK_SLEEP(us) ((void)(us))
CLOCK_T CLOCK_GET(void)
{
  struct timeval tv;
  (void)gettimeofday(&tv, 0);
  return (uint64_t)(tv.tv_sec * 1000000 + tv.tv_usec);
}

void
getcputime(long *sec, long *nsec)
{
  *sec = 0;
  *nsec = 0;
}
#define GETCPUTIME getcputime

/* No processes: system() always fails (the compiler's C-compiler step is never used here). */
int system(const char *command) { (void)command; return -1; }
