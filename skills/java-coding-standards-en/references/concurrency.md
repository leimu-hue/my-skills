# Concurrency Programming Standards

## Basic Principles

- Prefer avoiding shared mutable state; when local variables, immutable objects, message queues, or database transactions suffice, don't introduce hand-written locks
- Concurrent code must document shared state, thread boundaries, failure handling, and shutdown behavior
- Don't create bare threads; prefer the project's unified thread pool, Spring `TaskExecutor`, or an explicitly configured `ThreadPoolExecutor`
- Thread pools, locks, ThreadLocals, and async tasks must all consider release, timeout, rejection, exception handling, and monitoring
- Don't introduce concurrency just to "make it faster"; confirm the bottleneck and correctness requirements first

## Thread Pools

- Avoid `Executors.newFixedThreadPool`, `newCachedThreadPool`, `newScheduledThreadPool` as default business thread pool choices; they easily hide unbounded queues or unlimited thread risks
- Thread pools should explicitly configure: core threads, max threads, bounded queue, thread naming, rejection policy
- IO/CPU thread count formulas are only starting points; final values should be tuned via load testing, downstream capacity, and business latency requirements
- Rejection policy should match business semantics: degradable, retryable, discardable, or must-fail
- Expose metrics: active threads, queue size, rejection count, latency
- Gracefully shutdown on application exit
- For Java 21+ projects handling IO-intensive tasks, consider virtual threads as an alternative to traditional thread pools to reduce thread creation cost

```java
ThreadPoolExecutor executor = new ThreadPoolExecutor(
    8,
    16,
    60L,
    TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(500),
    new ThreadFactoryBuilder().setNameFormat("order-worker-%d").build(),
    new ThreadPoolExecutor.CallerRunsPolicy()
);
```

## Shared State

| Scenario | Recommended Tool | Notes |
| --- | --- | --- |
| State flag visibility | `volatile` | Only guarantees visibility, not atomicity of compound operations |
| Counters, sequences, increments | `AtomicInteger` / `AtomicLong` / `LongAdder` | Prefer `LongAdder` for high-contention counting |
| Simple mutual exclusion | `synchronized` | Lock object must be private and stable |
| Interruptible, time-bounded, try-lock | `ReentrantLock` | `unlock()` must be in `finally` |
| Read-heavy shared Map | `ConcurrentHashMap` | Use atomic methods like `computeIfAbsent` for compound operations |
| Read-heavy, write-rare list | `CopyOnWriteArrayList` | High cost when writes are frequent |

```java
private final AtomicInteger counter = new AtomicInteger();

public int nextCount() {
    return counter.incrementAndGet();
}
```

## Locks and Deadlocks

- Lock scope should be as small as possible; no remote calls, slow SQL, file IO, or complex logging inside locks
- Multiple locks must have a fixed acquisition order to avoid deadlocks
- Don't use strings, boxed objects, or Class objects as locks — they may be shared externally
- Before using `wait/notify`, consider `BlockingQueue`, `CountDownLatch`, `Semaphore`, or `Condition`
- After catching `InterruptedException`, restore the interrupt status or rethrow

```java
private final Object lock = new Object();

public void update(Data data) {
    Data prepared = prepare(data);
    synchronized (lock) {
        this.state = merge(this.state, prepared);
    }
}
```

## Concurrent Collections and Queues

- `ConcurrentHashMap` single `get/put` operations are thread-safe, but `containsKey` + `put` is not atomic
- Prefer bounded blocking queues to prevent unbounded task accumulation leading to OOM
- For producer-consumer models, prefer `BlockingQueue` over hand-written low-level `wait/notify`
- When using `LinkedBlockingQueue`, specify an explicit capacity unless unbounded accumulation is proven acceptable

```java
cache.computeIfAbsent(key, this::loadValue);

BlockingQueue<Task> queue = new ArrayBlockingQueue<>(1000);
```

## ThreadLocal

- Use `ThreadLocal` only for request context, tenant, traceId, and other thread-scoped context, and always clean up with `try/finally remove`
- In thread pools, uncleaned `ThreadLocal` will pollute subsequent tasks and cause memory leaks
- Use `InheritableThreadLocal` with caution; it's generally unreliable in thread pools, async frameworks, and task-reuse scenarios
- For cross-thread context propagation, prefer explicit parameters, task wrappers, or the project's unified context propagation mechanism

```java
try {
    UserContext.setCurrentUser(user);
    doBusiness();
} finally {
    UserContext.clear();
}
```

## Concurrency Utilities

| Utility | Applicable Scenario | Notes |
| --- | --- | --- |
| `CountDownLatch` | Waiting for multiple one-shot tasks to complete | `countDown()` in `finally` |
| `CyclicBarrier` | Multi-thread phased synchronization | Barrier action exceptions can break the barrier |
| `Semaphore` | Limiting concurrent access count | Only `release()` after successful `acquire()` |
| `CompletableFuture` | Async orchestration | Specify thread pool; handle exceptions and timeouts |
| `ScheduledExecutorService` | Scheduled tasks | Catch task exceptions to prevent silent stops |

```java
boolean acquired = semaphore.tryAcquire(200, TimeUnit.MILLISECONDS);
if (!acquired) {
    throw new TimeoutException("Timed out acquiring concurrency permit");
}
try {
    useLimitedResource();
} finally {
    semaphore.release();
}
```

## Async Tasks

- Async tasks must handle exceptions; don't just submit and forget
- When a result is needed, use `Future` / `CompletableFuture` with a timeout
- Don't submit blocking tasks to the common ForkJoinPool; specify a thread pool for business async work
- Batch async operations must limit concurrency to avoid overwhelming databases, RPC, or messaging systems

```java
CompletableFuture
    .supplyAsync(() -> client.query(orderNo), executor)
    .orTimeout(2, TimeUnit.SECONDS)
    .exceptionally(e -> fallback(orderNo, e));
```

## Concurrency Testing

- Concurrency tests should create simultaneous race conditions, e.g. `CountDownLatch` starting gate
- Tests must set timeouts to avoid hanging indefinitely on deadlocks
- Don't use fixed `Thread.sleep()` to wait for async completion; use conditional waits, latches, or future timeouts
- Concurrency issues are probabilistic; critical paths should combine stress testing, code review, and runtime metrics

```java
CountDownLatch start = new CountDownLatch(1);
CountDownLatch done = new CountDownLatch(threadCount);

for (int i = 0; i < threadCount; i++) {
    executor.submit(() -> {
        try {
            start.await();
            service.process();
        } finally {
            done.countDown();
        }
    });
}
start.countDown();
assertTrue(done.await(3, TimeUnit.SECONDS));
```
