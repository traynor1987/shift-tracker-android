package site.chatgpt.traynor1987.dominosshifttracker;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Properties;

/** Private disk staging, independent of Activity/WebView lifetime. No tracker DB access.
 * All methods are called serially on the export executor, never the UI thread. */
public final class NativeFileExport {
    public static final long TTL_MS = 24L * 60 * 60 * 1000;
    private static final long MAX_BYTES = 512L * 1024 * 1024;
    private final File directory;
    private final Properties metadata;
    private NativeFileExport(File directory, Properties metadata) { this.directory = directory; this.metadata = metadata; }
    public static final class ExportException extends IOException {
        public final String stage;
        public ExportException(String stage) { super("Export failed at " + stage); this.stage = stage; }
    }
    public interface Output { OutputStream open() throws IOException; }
    public interface Input { InputStream open() throws IOException; }
    public static NativeFileExport load(File directory) throws IOException {
        File file = new File(directory, "session.properties");
        if (!file.exists()) return null;
        Properties state = new Properties();
        try (InputStream input = new FileInputStream(file)) { state.load(input); }
        NativeFileExport export = new NativeFileExport(directory, state);
        if (System.currentTimeMillis() - Long.parseLong(state.getProperty("updated", "0")) > TTL_MS) {
            export.complete("error", "expired", "The staged backup expired. Export again.");
        }
        if (export.isTerminal()) new File(directory, "payload").delete();
        return export;
    }
    public static NativeFileExport begin(File directory, String id, String name, String mime, long characters) throws IOException {
        if (characters < 0 || characters > MAX_BYTES) throw new ExportException("size");
        NativeFileExport previous = load(directory);
        if (previous != null && !previous.isTerminal()) throw new ExportException("busy");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new ExportException("staging");
        File payload = new File(directory, "payload");
        try (FileOutputStream output = new FileOutputStream(payload)) { output.getFD().sync(); }
        Properties state = new Properties();
        state.setProperty("id", id); state.setProperty("name", name); state.setProperty("mime", mime);
        state.setProperty("characters", Long.toString(characters)); state.setProperty("received", "0"); state.setProperty("sequence", "0");
        state.setProperty("stage", "staging"); state.setProperty("status", "pending");
        NativeFileExport export = new NativeFileExport(directory, state); export.persist(); return export;
    }
    public String id() { return metadata.getProperty("id"); }
    public String filename() { return metadata.getProperty("name"); }
    public String mimeType() { return metadata.getProperty("mime"); }
    public String stage() { return metadata.getProperty("stage"); }
    public String destination() { return metadata.getProperty("destination", ""); }
    public void setDestination(String uri) throws IOException { metadata.setProperty("destination", uri); persist(); }
    public String status() { return metadata.getProperty("status"); }
    public String message() { return metadata.getProperty("message", ""); }
    public long bytes() { return Long.parseLong(metadata.getProperty("bytes", "0")); }
    public String hash() { return metadata.getProperty("sha256", ""); }
    public boolean isTerminal() { return !"pending".equals(status()); }
    public void append(int sequence, String content) throws IOException {
        if (!"staging".equals(stage()) || sequence != Integer.parseInt(metadata.getProperty("sequence")) || content.length() > 48 * 1024) throw new ExportException("staging");
        long received = Long.parseLong(metadata.getProperty("received")) + content.length();
        if (received > Long.parseLong(metadata.getProperty("characters"))) throw new ExportException("staging");
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        File payload = new File(directory, "payload");
        if (payload.length() + bytes.length > MAX_BYTES) throw new ExportException("size");
        try (FileOutputStream output = new FileOutputStream(payload, true)) { output.write(bytes); }
        metadata.setProperty("sequence", Integer.toString(sequence + 1)); metadata.setProperty("received", Long.toString(received));
        persist();
    }
    public void finish() throws IOException {
        if (!"staging".equals(stage()) || !metadata.getProperty("received").equals(metadata.getProperty("characters"))) throw new ExportException("staging");
        File payload = new File(directory, "payload");
        try (FileOutputStream output = new FileOutputStream(payload, true)) { output.getFD().sync(); }
        try (InputStream input = new FileInputStream(payload)) {
            Digest digest = digest(input); metadata.setProperty("sha256", digest.hash); metadata.setProperty("bytes", Long.toString(digest.bytes));
        }
        metadata.setProperty("stage", "picker"); persist();
    }
    public void writeAndVerify(Output destination, Input readback) throws IOException {
        if (!"picker".equals(stage()) && !"write".equals(stage()) && !"verify".equals(stage())) throw new ExportException("staging");
        metadata.setProperty("stage", "write"); persist();
        try (InputStream input = new FileInputStream(new File(directory, "payload")); OutputStream output = destination.open()) {
            if (output == null) throw new IOException("No output");
            byte[] buffer = new byte[64 * 1024]; int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            output.flush();
        } catch (Exception failure) { throw new ExportException("write"); }
        metadata.setProperty("stage", "verify"); persist();
        try (InputStream input = readback.open()) {
            if (input == null) throw new IOException("No readback");
            Digest actual = digest(input);
            if (actual.bytes != bytes() || !actual.hash.equals(hash())) throw new IOException("Readback mismatch");
        } catch (Exception failure) { throw new ExportException("verify"); }
        complete("saved", "verified", "Saved and read back successfully");
    }
    public void complete(String status, String stage, String message) throws IOException {
        metadata.setProperty("status", status); metadata.setProperty("stage", stage); metadata.setProperty("message", message);
        metadata.remove("destination");
        persist(); new File(directory, "payload").delete();
    }
    private void persist() throws IOException {
        metadata.setProperty("updated", Long.toString(System.currentTimeMillis()));
        File temporary = new File(directory, "session.tmp");
        try (FileOutputStream output = new FileOutputStream(temporary)) { metadata.store(output, "Private export receipt; no tracker records"); output.getFD().sync(); }
        if (!temporary.renameTo(new File(directory, "session.properties"))) throw new ExportException("staging");
    }
    private static final class Digest {
        final long bytes; final String hash;
        Digest(long bytes, String hash) { this.bytes = bytes; this.hash = hash; }
    }
    private static Digest digest(InputStream input) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[64 * 1024]; long bytes = 0; int read;
            while ((read = input.read(buffer)) != -1) { digest.update(buffer, 0, read); bytes += read; }
            StringBuilder hex = new StringBuilder(); for (byte item : digest.digest()) hex.append(String.format("%02x", item & 255));
            return new Digest(bytes, hex.toString());
        } catch (NoSuchAlgorithmException impossible) { throw new IOException(impossible); }
    }
}
