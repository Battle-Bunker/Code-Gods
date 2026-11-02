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

/*
 * sbrk over a reused memory. The host runs every compilation (and act) on one linear memory per module, zeroed between
 * runs (engine/haskell-wasi.mjs). wasi-libc's sbrk starts at the memory's current size, which after a large run would
 * leave its pages unused; this one keeps the break in zero-initialized data, so each run starts again at __heap_end
 * (wasi-libc's malloc takes __heap_base..__heap_end itself at startup) and grows the memory only past what it has.
 */
#include <errno.h>
extern unsigned char __heap_end;
static uintptr_t cg_brk;
void *
sbrk(intptr_t increment)
{
  if (!cg_brk)
    cg_brk = (uintptr_t)&__heap_end;
  uintptr_t old = cg_brk, next = old + (uintptr_t)increment;
  if (increment < 0 ? next > old : next < old) { errno = ENOMEM; return (void *)-1; }
  uintptr_t have = (uintptr_t)__builtin_wasm_memory_size(0) * 65536;
  if (next > have && __builtin_wasm_memory_grow(0, (next - have + 65535) / 65536) == (size_t)-1) {
    errno = ENOMEM;
    return (void *)-1;
  }
  cg_brk = next;
  return (void *)old;
}
