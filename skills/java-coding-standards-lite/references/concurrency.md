# 并发编程规范

## 基本原则

- 优先避免共享可变状态；能用局部变量、不可变对象、消息队列或数据库事务解决时，不引入手写锁
- 并发代码必须说明共享状态、线程边界、失败处理和关闭方式
- 不直接创建裸线程；优先使用项目统一线程池、Spring `TaskExecutor` 或显式配置的 `ThreadPoolExecutor`
- 线程池、锁、ThreadLocal、异步任务都必须考虑释放、超时、拒绝、异常和监控
- 不为“看起来更快”引入并发；先确认瓶颈和正确性要求

## 线程池

- 避免直接使用 `Executors.newFixedThreadPool`、`newCachedThreadPool`、`newScheduledThreadPool` 作为业务线程池默认方案；它们容易隐藏无界队列或无限线程风险
- 线程池应显式配置：核心线程数、最大线程数、有界队列、线程命名、拒绝策略
- IO/CPU 线程数公式只能作为起点，最终按压测、下游容量和业务延迟调整
- 拒绝策略要匹配业务语义：可降级、可重试、可丢弃、还是必须失败
- 应暴露活跃线程数、队列大小、拒绝次数、耗时等指标
- 应在应用关闭时优雅 shutdown
- Java 21+ 项目处理 IO 密集型任务时，可优先考虑虚拟线程替代传统线程池，降低线程创建成本

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

## 共享状态

| 场景 | 推荐工具 | 注意点 |
| --- | --- | --- |
| 状态标志可见性 | `volatile` | 只保证可见性，不保证复合操作原子性 |
| 计数、序列、自增 | `AtomicInteger` / `AtomicLong` / `LongAdder` | 高并发计数优先 `LongAdder` |
| 简单互斥 | `synchronized` | 锁对象必须私有且稳定 |
| 可中断、可超时、尝试加锁 | `ReentrantLock` | `unlock()` 必须在 `finally` |
| 读多写少共享 Map | `ConcurrentHashMap` | 复合操作用 `computeIfAbsent` 等原子方法 |
| 读多写极少列表 | `CopyOnWriteArrayList` | 写多时成本高 |

```java
private final AtomicInteger counter = new AtomicInteger();

public int nextCount() {
    return counter.incrementAndGet();
}
```

## 锁与死锁

- 锁范围越小越好，不在锁内执行远程调用、慢 SQL、文件 IO、复杂日志
- 多把锁必须固定获取顺序，避免死锁
- 不使用字符串、装箱对象、Class 对象等可能被外部共享的对象作为锁
- 使用 `wait/notify` 前优先考虑 `BlockingQueue`、`CountDownLatch`、`Semaphore`、`Condition`
- 捕获 `InterruptedException` 后应恢复中断状态或向上抛出

```java
private final Object lock = new Object();

public void update(Data data) {
    Data prepared = prepare(data);
    synchronized (lock) {
        this.state = merge(this.state, prepared);
    }
}
```

## 并发集合与队列

- `ConcurrentHashMap` 的单次 `get/put` 是线程安全的，但 `containsKey` + `put` 不是原子操作
- 优先使用有界阻塞队列，避免任务无限堆积导致 OOM
- 生产消费模型优先用 `BlockingQueue`，不要手写低层 `wait/notify`
- `LinkedBlockingQueue` 使用时应显式容量，除非已证明无界堆积可接受

```java
cache.computeIfAbsent(key, this::loadValue);

BlockingQueue<Task> queue = new ArrayBlockingQueue<>(1000);
```

## ThreadLocal

- `ThreadLocal` 只用于请求上下文、租户、traceId 等线程内上下文，且必须 `try/finally remove`
- 在线程池中不清理 `ThreadLocal` 会污染后续任务并造成内存泄漏
- 谨慎使用 `InheritableThreadLocal`；在线程池、异步框架、任务复用场景中通常不可靠
- 跨线程传递上下文优先使用显式参数、任务包装器或项目统一上下文传播机制

```java
try {
    UserContext.setCurrentUser(user);
    doBusiness();
} finally {
    UserContext.clear();
}
```

## 并发工具

| 工具 | 适用场景 | 注意点 |
| --- | --- | --- |
| `CountDownLatch` | 等待多个一次性任务完成 | `countDown()` 放 `finally` |
| `CyclicBarrier` | 多线程分阶段同步 | 注意 barrier action 异常会破坏屏障 |
| `Semaphore` | 限制并发访问数量 | 只有 acquire 成功后才能 release |
| `CompletableFuture` | 异步编排 | 指定线程池，处理异常和超时 |
| `ScheduledExecutorService` | 定时任务 | 捕获任务异常，避免任务静默停止 |

```java
boolean acquired = semaphore.tryAcquire(200, TimeUnit.MILLISECONDS);
if (!acquired) {
    throw new TimeoutException("获取并发许可超时");
}
try {
    useLimitedResource();
} finally {
    semaphore.release();
}
```

## 异步任务

- 异步任务必须处理异常，不能只提交后不观察结果
- 需要返回结果时使用 `Future` / `CompletableFuture` 并设置超时
- 不把阻塞任务提交到公共 ForkJoinPool；为业务异步指定线程池
- 批量异步要限制并发度，避免瞬间压垮数据库、RPC 或消息系统

```java
CompletableFuture
    .supplyAsync(() -> client.query(orderNo), executor)
    .orTimeout(2, TimeUnit.SECONDS)
    .exceptionally(e -> fallback(orderNo, e));
```

## 并发测试

- 并发测试要制造同时开始的竞争条件，如 `CountDownLatch` 起跑
- 测试必须设置超时，避免死锁时无限挂起
- 不用固定 `Thread.sleep()` 判断异步完成；使用条件等待、latch、future timeout
- 并发问题具有概率性，关键逻辑应结合压测、代码审查和运行时指标

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

## 检查清单

### 线程池

- [ ] 没有裸线程或无边界 `Executors` 默认线程池
- [ ] 队列有容量，线程有命名，拒绝策略明确
- [ ] 有关闭逻辑和监控指标
- [ ] Java 21+ 项目已评估虚拟线程适用场景

### 线程安全

- [ ] 共享可变状态已识别
- [ ] `volatile` 没被用于复合原子操作
- [ ] 锁对象私有稳定，锁内没有慢操作
- [ ] 多锁获取顺序固定

### 上下文与异步

- [ ] `ThreadLocal` 使用后必定清理
- [ ] 异步任务有异常处理和超时
- [ ] 跨线程上下文传递机制明确

### 测试

- [ ] 并发测试有同时起跑和超时
- [ ] 不使用固定 `sleep` 验证异步结果
- [ ] 关键并发路径有运行时指标或压测依据
