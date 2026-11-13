package site.chatgpt.traynor1987.dominosshifttracker;
import java.io.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
public class NativeFileExportTest {
  @org.junit.Test public void exportReliability() throws Exception { main(new String[0]); }
  public static void main(String[] args) throws Exception {
    File dir = Files.createTempDirectory("backup-export").toFile();
    NativeFileExport export = NativeFileExport.begin(dir, "one", "full.json", "application/json", 20_000_004);
    String chunk = "x".repeat(40_000);
    for (int i=0;i<500;i++) export.append(i, chunk);
    export.append(500, "🚙é!");
    export.finish();
    export = NativeFileExport.load(dir); // Activity/process recreation retains the staging request.
    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
    final NativeFileExport ready = export;
    ready.writeAndVerify(() -> bytes, () -> new ByteArrayInputStream(bytes.toByteArray()));
    if (!"saved".equals(ready.status()) || ready.bytes() != 20_000_007L) throw new AssertionError("large UTF-8 export lost bytes");
    if (!ready.hash().matches("[a-f0-9]{64}")) throw new AssertionError("missing verification digest");
    if (NativeFileExport.load(dir).status().equals("saved") == false) throw new AssertionError("terminal replay lost");
    if (new File(dir, "payload").exists()) throw new AssertionError("private staging retained after save");
    for (String failure : new String[]{"write", "verify"}) {
      NativeFileExport failed = NativeFileExport.begin(dir, failure, "full.json", "application/json", 2);
      failed.append(0, "{}"); failed.finish();
      try {
        failed.writeAndVerify(() -> { if (failure.equals("write")) throw new IOException("private path must not escape"); return new ByteArrayOutputStream(); }, () -> new ByteArrayInputStream("[]".getBytes(StandardCharsets.UTF_8)));
        throw new AssertionError("failed output reported saved");
      } catch (NativeFileExport.ExportException e) { if (!e.stage.equals(failure)) throw new AssertionError("wrong failure stage: " + e.stage); }
      failed.complete("error", failure, "Safe diagnostic");
      if (new File(dir, "payload").exists()) throw new AssertionError("failed staging retained");
    }
    NativeFileExport cancelled = NativeFileExport.begin(dir, "cancel", "empty.json", "application/json", 0);
    cancelled.finish(); cancelled.complete("cancelled", "picker", "Cancelled");
    if (!NativeFileExport.load(dir).status().equals("cancelled")) throw new AssertionError("cancel became failure");
    NativeFileExport incomplete = NativeFileExport.begin(dir, "incomplete", "full.json", "application/json", 3);
    try { incomplete.append(1, "{}"); throw new AssertionError("out of order accepted"); } catch (IOException expected) { }
    incomplete.append(0, "{}");
    try { incomplete.finish(); throw new AssertionError("truncated upload accepted"); } catch (IOException expected) { }
    incomplete.complete("error", "staging", "incomplete");
    System.out.println("Native export: large/UTF-8/recreation/readback/cancel/write/verification/order/truncation checks passed");
  }
}
