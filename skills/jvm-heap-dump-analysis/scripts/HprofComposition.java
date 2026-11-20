import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Streams an HPROF file and reports the composition of EVERY object it contains,
 * reachable or not. MAT drops unreachable objects while indexing, so its histogram
 * reports the live set only; this tool answers "what filled the heap at dump time".
 *
 * Usage: java HprofComposition.java <dump.hprof> [--top N] [--csv out.csv]
 *
 * Requires JDK 11+ (single-file source launcher). No MAT, no build step.
 *
 * Class names are printed in source form (java.lang.String[], int[][]) so the
 * --csv output can be joined with MAT's live histogram; the OBJECT_ARRAY_DUMP
 * record stores the array class id, not the element class id, so descriptors
 * must not be wrapped a second time.
 */
public class HprofComposition {

    static int idSize;
    static CountingInputStream cin;
    static DataInputStream in;

    static final Map<Long, Long> classToNameId = new HashMap<>();
    static final Map<Long, String> names = new HashMap<>();
    static final Set<Long> wantedNameIds = new HashSet<>();

    static final Map<Long, long[]> instances = new HashMap<>();   // classObjId -> {count, bytes}
    static final Map<Long, long[]> objArrays = new HashMap<>();   // elemClassId -> {count, bytes}
    static final long[] primCount = new long[12];
    static final long[] primBytes = new long[12];

    static final String[] PRIM_NAMES =
            {"", "", "", "", "boolean[]", "char[]", "float[]", "double[]", "byte[]", "short[]", "int[]", "long[]"};

    static final Map<Character, String> PRIM_TYPE = Map.of(
            'Z', "boolean", 'C', "char", 'F', "float", 'D', "double",
            'B', "byte", 'S', "short", 'I', "int", 'J', "long");

    static long totalObjects, totalBytes;

    public static void main(String[] args) throws Exception {
        if (args.length == 0 || args[0].startsWith("--")) {
            System.err.println("usage: java HprofComposition.java <dump.hprof> [--top N] [--csv out.csv]");
            System.exit(2);
        }
        File dump = new File(args[0]);
        int top = 25;
        String csv = null;
        for (int i = 1; i < args.length; i++) {
            if (args[i].equals("--top") && i + 1 < args.length) top = Integer.parseInt(args[++i]);
            else if (args[i].equals("--csv") && i + 1 < args.length) csv = args[++i];
        }
        if (!dump.isFile()) {
            System.err.println("not a file: " + dump);
            System.exit(2);
        }

        long t0 = System.currentTimeMillis();
        long nameIds = pass1(dump);
        pass2(dump);
        report(top, csv);
        System.err.printf("scanned %.1f GB in %d s, %d classes%n",
                dump.length() / 1073741824.0, (System.currentTimeMillis() - t0) / 1000, nameIds);
    }

    // ---------------------------------------------------------------- passes

    static long pass1(File f) throws IOException {
        open(f);
        while (true) {
            int tag = in.read();
            if (tag < 0) break;
            in.readInt();
            long len = u4();
            if (tag == 0x02) {                       // LOAD_CLASS
                in.readInt();
                long classObjId = readId();
                in.readInt();
                long nameId = readId();
                classToNameId.put(classObjId, nameId);
                wantedNameIds.add(nameId);
            } else {
                skip(len);
            }
        }
        close();
        return classToNameId.size();
    }

    static void pass2(File f) throws IOException {
        open(f);
        while (true) {
            int tag = in.read();
            if (tag < 0) break;
            in.readInt();
            long len = u4();
            if (tag == 0x01) {                       // STRING: id + raw bytes, NO inner length field
                long id = readId();
                byte[] b = new byte[(int) (len - idSize)];
                in.readFully(b);
                if (wantedNameIds.contains(id)) names.put(id, new String(b, StandardCharsets.UTF_8));
            } else if (tag == 0x1C || tag == 0x0C) { // HEAP_DUMP_SEGMENT / HEAP_DUMP
                heapSegment(cin.getCount() + len);
            } else {
                skip(len);
            }
        }
        close();
    }

    static void heapSegment(long end) throws IOException {
        while (cin.getCount() < end) {
            int sub = in.readUnsignedByte();
            switch (sub) {
                case 0xFE: in.readInt(); readId(); break;                       // HEAP_DUMP_INFO
                case 0xFF: case 0x05: case 0x07: readId(); break;               // roots without thread
                case 0x01: readId(); readId(); break;                           // JNI global
                case 0x02: case 0x03: case 0x08: readId(); in.readInt(); in.readInt(); break;
                case 0x04: case 0x06: readId(); in.readInt(); break;
                case 0x20: readClassDump(); break;
                case 0x21: {                                                    // INSTANCE_DUMP
                    readId(); in.readInt();
                    long cls = readId();
                    int n = in.readInt();
                    skip(n);
                    long[] a = instances.computeIfAbsent(cls, k -> new long[2]);
                    a[0]++; a[1] += n;
                    totalObjects++; totalBytes += n;
                    break;
                }
                case 0x22: {                                                    // OBJECT_ARRAY_DUMP
                    readId(); in.readInt();
                    int n = in.readInt();
                    long arrayCls = readId();   // the ARRAY's class (e.g. [Ljava.lang.String;), not the element class
                    long bytes = (long) n * idSize;
                    skip(bytes);
                    long[] a = objArrays.computeIfAbsent(arrayCls, k -> new long[2]);
                    a[0]++; a[1] += bytes;
                    totalObjects++; totalBytes += bytes;
                    break;
                }
                case 0x23: {                                                    // PRIMITIVE_ARRAY_DUMP
                    readId(); in.readInt();
                    int n = in.readInt();
                    int t = in.readUnsignedByte();
                    long bytes = (long) n * primSize(t);
                    skip(bytes);
                    int ti = t < primCount.length ? t : 0;
                    primCount[ti]++; primBytes[ti] += bytes;
                    totalObjects++; totalBytes += bytes;
                    break;
                }
                default:
                    throw new IOException("unknown sub-record 0x" + Integer.toHexString(sub)
                            + " at offset " + cin.getCount());
            }
        }
    }

    /** CLASS_DUMP: constant pool entries are variable length, instance fields carry no value. */
    static void readClassDump() throws IOException {
        readId(); in.readInt();                       // class id, stack trace serial
        for (int i = 0; i < 6; i++) readId();         // super, loader, signers, PD, reserved, reserved
        in.readInt();                                 // instance size
        int cp = in.readUnsignedShort();
        for (int i = 0; i < cp; i++) {
            in.readUnsignedShort();
            int t = in.readUnsignedByte();
            if (t == 2) readId(); else skip(primSize(t));
        }
        int sf = in.readUnsignedShort();
        for (int i = 0; i < sf; i++) {                // static field: id name + type + VALUE
            readId();
            int t = in.readUnsignedByte();
            if (t == 2) readId(); else skip(primSize(t));
        }
        int nf = in.readUnsignedShort();
        for (int i = 0; i < nf; i++) {                // instance field: id name + type only
            readId();
            in.readUnsignedByte();
        }
    }

    // ---------------------------------------------------------------- report

    static void report(int top, String csvPath) throws IOException {
        List<Object[]> rows = new ArrayList<>();
        for (Map.Entry<Long, long[]> e : instances.entrySet())
            rows.add(new Object[]{className(e.getKey()), e.getValue()[0], e.getValue()[1]});
        for (Map.Entry<Long, long[]> e : objArrays.entrySet())
            rows.add(new Object[]{sourceName(className(e.getKey())), e.getValue()[0], e.getValue()[1]});
        for (int i = 4; i < 12; i++)
            if (primCount[i] > 0) rows.add(new Object[]{PRIM_NAMES[i], primCount[i], primBytes[i]});
        rows.sort((a, b) -> Long.compare((long) b[2], (long) a[2]));

        long mb = 1024 * 1024;
        System.out.println("total_objects=" + totalObjects);
        System.out.println("object_payload_bytes=" + totalBytes + " (" + totalBytes / mb + " MB)");
        System.out.println("note: this is HPROF record payload (8-byte ids), NOT JVM heap bytes.");
        System.out.println("      a compressed-oops heap uses 4-byte refs, so object arrays and");
        System.out.println("      instances with reference fields are inflated here.");
        System.out.println("      for heap size use MAT: live shallow + 'Removed N unreachable objects using X bytes'.");
        System.out.println();
        System.out.printf("%-62s %12s %10s%n", "class", "count", "MB");
        for (int i = 0; i < Math.min(top, rows.size()); i++) {
            Object[] r = rows.get(i);
            System.out.printf("%-62s %12d %10d%n", trim((String) r[0]), (long) r[1], (long) r[2] / mb);
        }
        System.out.println();
        for (int i = 4; i < 12; i++)
            if (primCount[i] > 0)
                System.out.printf("%-10s count=%-12d MB=%d%n", PRIM_NAMES[i], primCount[i], primBytes[i] / mb);

        if (csvPath != null) {
            try (PrintWriter w = new PrintWriter(new OutputStreamWriter(
                    new FileOutputStream(csvPath), StandardCharsets.UTF_8))) {
                w.println("class,count,bytes");
                for (Object[] r : rows)
                    w.println(quote((String) r[0]) + "," + r[1] + "," + r[2]);
            }
            System.out.println("\ncsv=" + csvPath);
        }
    }

    // ---------------------------------------------------------------- plumbing

    static String className(long classId) {
        Long nid = classToNameId.get(classId);
        if (nid == null) return "?class#" + classId;
        String n = names.get(nid);
        return n == null ? "?name#" + nid : n.replace('/', '.');
    }

    /** "[Ljava.lang.Object;" -> "java.lang.Object[]", "[[I" -> "int[][]". */
    static String sourceName(String desc) {
        if (desc == null || !desc.startsWith("[")) return desc;
        int depth = 0;
        while (depth < desc.length() && desc.charAt(depth) == '[') depth++;
        String base = desc.substring(depth);
        if (base.startsWith("L") && base.endsWith(";")) {
            base = base.substring(1, base.length() - 1);
        } else if (base.length() == 1) {
            base = PRIM_TYPE.getOrDefault(base.charAt(0), base);
        }
        StringBuilder sb = new StringBuilder(base);
        for (int i = 0; i < depth; i++) sb.append("[]");
        return sb.toString();
    }

    static String trim(String s) { return s.length() > 62 ? s.substring(0, 59) + "..." : s; }

    static String quote(String s) { return "\"" + s.replace("\"", "\"\"") + "\""; }

    static int primSize(int t) {
        switch (t) {
            case 4: case 8: return 1;                 // boolean, byte
            case 5: case 9: return 2;                 // char, short
            case 6: case 10: return 4;                // float, int
            case 7: case 11: return 8;                // double, long
            default: return 1;
        }
    }

    static long readId() throws IOException { return idSize == 4 ? in.readInt() & 0xffffffffL : in.readLong(); }

    static long u4() throws IOException { return in.readInt() & 0xffffffffL; }

    static void skip(long n) throws IOException { in.skipBytes((int) n); }

    static void open(File f) throws IOException {
        cin = new CountingInputStream(new BufferedInputStream(new FileInputStream(f), 1 << 20));
        in = new DataInputStream(cin);
        StringBuilder sb = new StringBuilder();
        int c;
        while ((c = in.read()) > 0) sb.append((char) c);   // "JAVA PROFILE 1.0.2\0"
        idSize = in.readInt();
        in.readLong();                                      // timestamp
    }

    static void close() throws IOException { in.close(); }

    static class CountingInputStream extends FilterInputStream {
        private long count;
        CountingInputStream(InputStream in) { super(in); }
        public int read() throws IOException { int r = super.read(); if (r >= 0) count++; return r; }
        public int read(byte[] b, int off, int len) throws IOException {
            int r = super.read(b, off, len);
            if (r > 0) count += r;
            return r;
        }
        public long skip(long n) throws IOException { long r = super.skip(n); count += r; return r; }
        long getCount() { return count; }
    }
}
