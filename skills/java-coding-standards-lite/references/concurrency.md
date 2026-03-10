# 并发编程规范

## 线程池使用

### 线程池创建

#### ❌ 避免使用Executors工具类
```java
// ❌ 错误：Executors创建的线程池可能有问题
ExecutorService executor = Executors.newFixedThreadPool(10);
ExecutorService cachedExecutor = Executors.newCachedThreadPool();
ScheduledExecutorService scheduledExecutor = Executors.newScheduledThreadPool(5);
```

**问题分析：**
- `newFixedThreadPool`：使用无界队列，可能导致OOM
- `newCachedThreadPool`：最大线程数无限制，可能创建过多线程
- `newScheduledThreadPool`：使用无界队列，任务堆积可能导致OOM

#### ✅ 使用ThreadPoolExecutor显式创建
```java
// ✅ 正确：显式配置线程池参数
ThreadPoolExecutor executor = new ThreadPoolExecutor(
    10,                              // corePoolSize：核心线程数
    20,                              // maximumPoolSize：最大线程数
    60L,                            // keepAliveTime：空闲线程存活时间
    TimeUnit.SECONDS,               // unit：时间单位
    new LinkedBlockingQueue<>(100), // workQueue：工作队列
    new ThreadFactoryBuilder()      // threadFactory：线程工厂
        .setNameFormat("order-processor-%d")
        .setDaemon(false)
        .build(),
    new ThreadPoolExecutor.CallerRunsPolicy() // handler：拒绝策略
);
```

### 线程池参数配置

#### 核心参数说明
```java
// CPU密集型任务：核心线程数 = CPU核心数 + 1
int cpuIntensiveCorePool = Runtime.getRuntime().availableProcessors() + 1;

// IO密集型任务：核心线程数 = CPU核心数 * 2
int ioIntensiveCorePool = Runtime.getRuntime().availableProcessors() * 2;

// 混合型任务：根据具体业务调整
int mixedCorePool = Runtime.getRuntime().availableProcessors();
```

#### 队列选择
```java
// 有界队列：控制内存使用
new ArrayBlockingQueue<>(1000);

// 无界队列：可能导致OOM，谨慎使用
new LinkedBlockingQueue<>();

// 同步队列：直接传递，不存储
new SynchronousQueue<>();

// 优先级队列：按优先级处理任务
new PriorityBlockingQueue<>();
```

#### 拒绝策略
```java
// 抛出异常（默认）
new ThreadPoolExecutor.AbortPolicy()

// 由调用线程执行任务
new ThreadPoolExecutor.CallerRunsPolicy()

// 丢弃最老的任务
new ThreadPoolExecutor.DiscardOldestPolicy()

// 直接丢弃任务
new ThreadPoolExecutor.DiscardPolicy()

// 自定义拒绝策略
new RejectedExecutionHandler() {
    @Override
    public void rejectedExecution(Runnable r, ThreadPoolExecutor executor) {
        logger.warn("任务被拒绝执行: {}", r.toString());
        // 可以记录到数据库、发送到消息队列等
    }
}
```

### 线程池监控

#### 监控指标
```java
public class ThreadPoolMonitor {
    private final ThreadPoolExecutor executor;

    public void printThreadPoolStatus() {
        logger.info("线程池状态: " +
            "核心线程数: {}, " +
            "活跃线程数: {}, " +
            "最大线程数: {}, " +
            "队列大小: {}, " +
            "队列剩余容量: {}, " +
            "完成任务数: {}",
            executor.getCorePoolSize(),
            executor.getActiveCount(),
            executor.getMaximumPoolSize(),
            executor.getQueue().size(),
            executor.getQueue().remainingCapacity(),
            executor.getCompletedTaskCount()
        );
    }
}
```

#### 定期监控
```java
@Scheduled(fixedRate = 30000) // 每30秒执行一次
public void monitorThreadPool() {
    threadPoolMonitor.printThreadPoolStatus();
}
```

## 线程安全

### volatile关键字

#### 使用场景
```java
// ✅ 正确：保证可见性
public class Counter {
    private volatile int count = 0;

    public void increment() {
        count++; // 注意：volatile不保证原子性
    }

    public int getCount() {
        return count;
    }
}

// ✅ 正确：状态标志
public class TaskRunner {
    private volatile boolean running = true;

    public void stop() {
        running = false;
    }

    public void run() {
        while (running) {
            // 执行任务
        }
    }
}
```

#### ⚠️ 注意事项
- `volatile`只保证可见性，不保证原子性
- `count++`操作不是原子性的，需要配合其他同步机制

### Atomic原子类

#### 常用原子类
```java
// ✅ 正确：使用原子类
public class AtomicCounter {
    private final AtomicInteger counter = new AtomicInteger(0);
    private final AtomicLong sequence = new AtomicLong(0);
    private final AtomicBoolean initialized = new AtomicBoolean(false);

    public int incrementAndGet() {
        return counter.incrementAndGet();
    }

    public long getNextSequence() {
        return sequence.incrementAndGet();
    }

    public boolean initialize() {
        return initialized.compareAndSet(false, true);
    }
}

// 原子更新器
public class AtomicUpdater {
    private static final AtomicReferenceFieldUpdater<User, String> NAME_UPDATER =
        AtomicReferenceFieldUpdater.newUpdater(User.class, String.class, "name");

    public void updateUserName(User user, String newName) {
        NAME_UPDATER.compareAndSet(user, user.getName(), newName);
    }
}
```

#### AtomicReference
```java
// ✅ 正确：原子引用
public class AtomicReferenceExample {
    private final AtomicReference<BigDecimal> balance = new AtomicReference<>(BigDecimal.ZERO);

    public boolean deposit(BigDecimal amount) {
        while (true) {
            BigDecimal current = balance.get();
            BigDecimal newBalance = current.add(amount);
            if (balance.compareAndSet(current, newBalance)) {
                return true;
            }
            // CAS失败，重试
        }
    }
}
```

### synchronized关键字

#### 方法同步
```java
// ✅ 正确：实例方法同步
public class SynchronizedCounter {
    private int count = 0;

    public synchronized void increment() {
        count++;
    }

    public synchronized int getCount() {
        return count;
    }
}

// ✅ 正确：静态方法同步
public class SynchronizedUtil {
    private static int sharedCount = 0;

    public static synchronized void incrementShared() {
        sharedCount++;
    }
}
```

#### 代码块同步
```java
// ✅ 正确：同步代码块
public class BankAccount {
    private final Object lock = new Object();
    private BigDecimal balance = BigDecimal.ZERO;

    public void transfer(BankAccount target, BigDecimal amount) {
        synchronized (lock) {
            if (this.balance.compareTo(amount) >= 0) {
                this.balance = this.balance.subtract(amount);
                target.balance = target.balance.add(amount);
            }
        }
    }
}

// ❌ 错误：锁对象选择不当
public class WrongExample {
    private String lock = "lock"; // 字符串常量可能被复用

    public void method() {
        synchronized (lock) {
            // 同步代码
        }
    }
}
```

### Lock接口

#### ReentrantLock使用
```java
// ✅ 正确：使用ReentrantLock
public class ReentrantLockExample {
    private final ReentrantLock lock = new ReentrantLock();
    private int count = 0;

    public void increment() {
        lock.lock();
        try {
            count++;
        } finally {
            lock.unlock();
        }
    }

    public int getCount() {
        lock.lock();
        try {
            return count;
        } finally {
            lock.unlock();
        }
    }
}
```

#### 读写锁
```java
// ✅ 正确：使用读写锁
public class ReadWriteLockExample {
    private final ReadWriteLock rwLock = new ReentrantReadWriteLock();
    private final Map<String, Object> cache = new HashMap<>();

    public Object get(String key) {
        rwLock.readLock().lock();
        try {
            return cache.get(key);
        } finally {
            rwLock.readLock().unlock();
        }
    }

    public void put(String key, Object value) {
        rwLock.writeLock().lock();
        try {
            cache.put(key, value);
        } finally {
            rwLock.writeLock().unlock();
        }
    }
}
```

#### 条件变量
```java
// ✅ 正确：使用Condition
public class ConditionExample {
    private final Lock lock = new ReentrantLock();
    private final Condition notEmpty = lock.newCondition();
    private final Condition notFull = lock.newCondition();
    private final Queue<Object> queue = new LinkedList<>();
    private final int capacity = 10;

    public void produce(Object item) throws InterruptedException {
        lock.lock();
        try {
            while (queue.size() >= capacity) {
                notFull.await();
            }
            queue.offer(item);
            notEmpty.signal();
        } finally {
            lock.unlock();
        }
    }

    public Object consume() throws InterruptedException {
        lock.lock();
        try {
            while (queue.isEmpty()) {
                notEmpty.await();
            }
            Object item = queue.poll();
            notFull.signal();
            return item;
        } finally {
            lock.unlock();
        }
    }
}
```

## 并发集合

### ConcurrentHashMap

#### 正确使用
```java
// ✅ 正确：使用ConcurrentHashMap
public class ConcurrentCache {
    private final ConcurrentHashMap<String, Object> cache = new ConcurrentHashMap<>();

    public void put(String key, Object value) {
        cache.put(key, value);
    }

    public Object get(String key) {
        return cache.get(key);
    }

    public void computeIfAbsent(String key, Function<String, Object> mappingFunction) {
        cache.computeIfAbsent(key, mappingFunction);
    }

    // 批量操作
    public void putAll(Map<String, Object> data) {
        cache.putAll(data);
    }
}
```

#### 避免的问题
```java
// ❌ 错误：复合操作不是原子的
if (!cache.containsKey(key)) {
    cache.put(key, value);
}

// ✅ 正确：使用原子方法
cache.computeIfAbsent(key, k -> value);
```

### CopyOnWriteArrayList

#### 适用场景
```java
// ✅ 正确：读多写少的场景
public class EventListeners {
    private final List<EventListener> listeners = new CopyOnWriteArrayList<>();

    public void addListener(EventListener listener) {
        listeners.add(listener);
    }

    public void removeListener(EventListener listener) {
        listeners.remove(listener);
    }

    public void notifyListeners(Event event) {
        for (EventListener listener : listeners) {
            listener.onEvent(event);
        }
    }
}
```

### 阻塞队列

#### ArrayBlockingQueue
```java
// ✅ 正确：有界阻塞队列
public class BoundedQueueExample {
    private final BlockingQueue<Task> taskQueue = new ArrayBlockingQueue<>(100);

    public void produce(Task task) throws InterruptedException {
        taskQueue.put(task); // 队列满时阻塞
    }

    public Task consume() throws InterruptedException {
        return taskQueue.take(); // 队列空时阻塞
    }

    public boolean offer(Task task, long timeout, TimeUnit unit) throws InterruptedException {
        return taskQueue.offer(task, timeout, unit); // 超时返回false
    }
}
```

#### LinkedBlockingQueue
```java
// ✅ 正确：可选择有界或无界
public class UnboundedQueueExample {
    private final BlockingQueue<Task> taskQueue = new LinkedBlockingQueue<>();

    public void produce(Task task) {
        taskQueue.offer(task); // 不会阻塞
    }

    public Task consume() throws InterruptedException {
        return taskQueue.take();
    }
}
```

## ThreadLocal使用

### 正确使用

#### 基本使用
```java
// ✅ 正确：ThreadLocal使用
public class UserContext {
    private static final ThreadLocal<User> currentUser = new ThreadLocal<>();

    public static void setCurrentUser(User user) {
        currentUser.set(user);
    }

    public static User getCurrentUser() {
        return currentUser.get();
    }

    public static void clear() {
        currentUser.remove(); // 重要：防止内存泄漏
    }
}
```

#### 使用示例
```java
@Service
public class UserService {

    public void processRequest(User user) {
        try {
            UserContext.setCurrentUser(user);
            // 处理业务逻辑
            doBusinessLogic();
        } finally {
            UserContext.clear(); // 确保清理
        }
    }

    private void doBusinessLogic() {
        // 在任何地方都可以获取当前用户
        User currentUser = UserContext.getCurrentUser();
    }
}
```

### 内存泄漏防范

#### ✅ 正确的清理
```java
// ✅ 正确：使用try-finally确保清理
public void processWithThreadLocal() {
    try {
        threadLocalValue.set(someValue);
        // 业务逻辑
    } finally {
        threadLocalValue.remove(); // 必须清理
    }
}

// ✅ 正确：使用remove方法
@PreDestroy
public void cleanup() {
    threadLocalValue.remove();
}
```

#### ❌ 错误的用法
```java
// ❌ 错误：没有清理ThreadLocal
public void wrongUsage() {
    threadLocalValue.set(someValue);
    // 没有清理，可能导致内存泄漏
}
```

### InheritableThreadLocal

#### 父子线程传递
```java
// ✅ 正确：父子线程间传递
public class InheritableExample {
    private static final InheritableThreadLocal<String> context =
        new InheritableThreadLocal<>();

    public void parentMethod() {
        context.set("parent value");

        new Thread(() -> {
            // 子线程可以访问父线程的值
            System.out.println(context.get()); // 输出: parent value
        }).start();
    }
}
```

## 并发工具类

### CountDownLatch

#### 使用示例
```java
// ✅ 正确：等待多个任务完成
public class CountDownLatchExample {
    public void processMultipleTasks() throws InterruptedException {
        int taskCount = 5;
        CountDownLatch latch = new CountDownLatch(taskCount);

        for (int i = 0; i < taskCount; i++) {
            executor.submit(() -> {
                try {
                    // 执行任务
                    doTask();
                } finally {
                    latch.countDown();
                }
            });
        }

        // 等待所有任务完成
        latch.await();
        System.out.println("所有任务完成");
    }
}
```

### CyclicBarrier

#### 使用示例
```java
// ✅ 正确：多线程同步点
public class CyclicBarrierExample {
    private final CyclicBarrier barrier = new CyclicBarrier(3, () -> {
        System.out.println("所有线程到达屏障点");
    });

    public void runTasks() {
        for (int i = 0; i < 3; i++) {
            executor.submit(() -> {
                try {
                    System.out.println("线程开始执行");
                    Thread.sleep(1000); // 模拟工作
                    barrier.await(); // 等待其他线程
                    System.out.println("线程继续执行");
                } catch (Exception e) {
                    Thread.currentThread().interrupt();
                }
            });
        }
    }
}
```

### Semaphore

#### 使用示例
```java
// ✅ 正确：控制并发访问数量
public class SemaphoreExample {
    private final Semaphore semaphore = new Semaphore(3); // 最多3个并发

    public void accessResource() {
        try {
            semaphore.acquire();
            // 访问受限资源
            useLimitedResource();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            semaphore.release();
        }
    }
}
```

## 并发最佳实践

### 1. 避免死锁

#### 死锁预防
```java
// ✅ 正确：按固定顺序获取锁
public void transfer(Account from, Account to, BigDecimal amount) {
    // 按账户ID排序，确保锁的获取顺序一致
    Account first = from.getId() < to.getId() ? from : to;
    Account second = from.getId() < to.getId() ? to : from;

    synchronized (first) {
        synchronized (second) {
            // 执行转账
        }
    }
}

// ❌ 错误：可能导致死锁
public void wrongTransfer(Account from, Account to, BigDecimal amount) {
    synchronized (from) {
        synchronized (to) {
            // 如果其他线程按相反顺序获取锁，可能死锁
        }
    }
}
```

### 2. 减少锁的粒度

#### 缩小同步范围
```java
// ✅ 正确：最小化同步范围
public void processData() {
    // 非同步操作
    Data data = prepareData();

    synchronized (this) {
        // 只同步必要的代码
        updateSharedState(data);
    }

    // 非同步操作
    postProcess(data);
}

// ❌ 错误：同步范围过大
public void wrongProcessData() {
    synchronized (this) {
        Data data = prepareData();
        updateSharedState(data);
        postProcess(data);
    }
}
```

### 3. 使用无锁编程

#### 无锁数据结构
```java
// ✅ 正确：使用无锁队列
public class LockFreeExample {
    private final ConcurrentLinkedQueue<Task> taskQueue = new ConcurrentLinkedQueue<>();

    public void addTask(Task task) {
        taskQueue.offer(task); // 无锁操作
    }

    public Task getTask() {
        return taskQueue.poll(); // 无锁操作
    }
}
```

## 并发测试

### 多线程测试

#### 使用CountDownLatch进行测试
```java
@Test
public void testConcurrentAccess() throws InterruptedException {
    int threadCount = 10;
    CountDownLatch startLatch = new CountDownLatch(1);
    CountDownLatch endLatch = new CountDownLatch(threadCount);
    AtomicInteger successCount = new AtomicInteger(0);

    for (int i = 0; i < threadCount; i++) {
        executor.submit(() -> {
            try {
                startLatch.await(); // 等待开始信号
                // 执行并发操作
                if (performConcurrentOperation()) {
                    successCount.incrementAndGet();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                endLatch.countDown();
            }
        });
    }

    startLatch.countDown(); // 发送开始信号
    endLatch.await(); // 等待所有线程完成

    assertEquals(threadCount, successCount.get());
}
```

## 并发检查清单

### 线程池检查
- [ ] 不使用Executors工具类创建线程池
- [ ] 合理配置核心线程数和最大线程数
- [ ] 选择合适的工作队列
- [ ] 配置合适的拒绝策略
- [ ] 实现线程池监控

### 线程安全检查
- [ ] 正确使用synchronized关键字
- [ ] 合理使用Lock接口
- [ ] 使用原子类替代synchronized
- [ ] 正确使用volatile关键字
- [ ] 避免死锁

### 并发集合检查
- [ ] 使用ConcurrentHashMap替代synchronized Map
- [ ] 根据场景选择合适的并发集合
- [ ] 正确使用阻塞队列
- [ ] 注意复合操作的原子性

### ThreadLocal检查
- [ ] 及时清理ThreadLocal变量
- [ ] 使用try-finally确保清理
- [ ] 考虑使用InheritableThreadLocal
- [ ] 避免内存泄漏

### 性能检查
- [ ] 减少锁的粒度
- [ ] 避免过度同步
- [ ] 使用无锁编程
- [ ] 合理设置线程池参数