package site.chatgpt.traynor1987.dominosshifttracker

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Wearable
import org.json.JSONArray
import org.json.JSONObject
import java.io.*
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ExecutorService
import java.util.concurrent.TimeUnit

/** Stable Wear update channel. It is deliberately separate from the PWA and
 * regular shift/action messages. The watch remains responsible for install. */
class WearUpdateManager(private val context: Context, private val executor: ExecutorService, private val emit: (JSONObject) -> Unit) {
    companion object {
        const val PREPARE = "/shift-tracker/update/wear/prepare"; const val STATUS = "/shift-tracker/update/wear/status"; const val CHANNEL = "/shift-tracker/update/wear/apk"; const val VERSION = "/shift-tracker/update/wear/version"
        private const val RELEASES = "https://api.github.com/repos/traynor1987/shift-tracker-android/releases"; private const val METADATA = "shift-tracker-android-release.json"; private const val PREFS = "wear_update"; private const val MAX = 180L * 1024 * 1024
        fun recordVersion(c: Context, n: String, v: Long) { if (n.matches(Regex("\\d+\\.\\d+\\.\\d+")) && v > 0) c.getSharedPreferences(PREFS, 0).edit().putString("name", n).putLong("code", v).apply() }
        fun version(c: Context): Pair<String,Long>? { val p=c.getSharedPreferences(PREFS,0); val n=p.getString("name",null)?:return null; val v=p.getLong("code",0); return n.takeIf{v>0}?.let{it to v} }
        fun receiveStatus(c: Context, raw: String) { val o=runCatching{JSONObject(raw)}.getOrNull()?:return; if(o.optString("kind")=="version") recordVersion(c,o.optString("versionName"),o.optLong("versionCode")); val s=o.optString("state"); if(s in setOf("receiving","ready_to_install","failed","installer_opened","install_permission_required")) MainActivity.sendNativeMessage(JSONObject().put("type","shift_tracker_wear_update:status").put("state",s).put("message",o.optString("message")).toString()) }
    }
    data class Candidate(val name:String,val code:Long,val file:String,val sha:String,val url:String)
    @Volatile private var candidate:Candidate?=null
    fun check(manual:Boolean) { emit(state("checking")); executor.execute { runCatching { val c=discover(); candidate=c; val watch=version(context); val node=node(); state(when { node==null->"watch_not_connected"; watch==null->"watch_version_unknown"; c.code>watch.second->"available"; else->"up_to_date" }).put("latestVersion",c.name).put("latestVersionCode",c.code).put("updateAvailable",watch?.let{c.code>it.second}?:false) }.onSuccess(emit).onFailure{emit(state("unavailable").put("message","Could not check Wear OS updates. Nothing changed."))} } }
    fun send() { val c=candidate; val installed=version(context); if(c==null||installed==null||c.code<=installed.second){emit(state("no_verified_update"));return}; emit(state("downloading")); executor.execute { var apk:File?=null; runCatching { val id=node()?:error("Watch disconnected"); apk=download(c); verify(apk!!,c.code); emit(state("verified")); transfer(id,apk!!,c); state("sent_to_watch").put("latestVersion",c.name).put("message","Ready to install on watch") }.onSuccess(emit).onFailure{emit(state("failed").put("message","Wear update was not sent. Existing apps are unchanged."))}; apk?.delete() } }
    private fun discover(): Candidate {
        val releases = JSONArray(text(RELEASES, 2_000_000))
        val release = (0 until releases.length()).map { releases.getJSONObject(it) }
            .firstOrNull { !it.optBoolean("draft") && !it.optBoolean("prerelease") }
            ?: error("No stable release")
        val assets = release.getJSONArray("assets")
        fun asset(name: String): JSONObject = (0 until assets.length())
            .map { assets.getJSONObject(it) }
            .firstOrNull { it.optString("name") == name }
            ?: error("asset missing")
        val metadata = JSONObject(text(asset(METADATA).getString("browser_download_url"), 131072))
        require(metadata.optString("channel") == "stable")
        val wear = metadata.optJSONObject("wear") ?: error("Wear update unavailable")
        val name = wear.optString("versionName")
        val code = wear.optLong("versionCode", 0)
        val file = wear.optString("asset")
        val digest = wear.optString("sha256").lowercase()
        require(name.matches(Regex("\\d+\\.\\d+\\.\\d+")) && code > 0 &&
            file == "Shift-Tracker-Wear-$name.apk" && digest.matches(Regex("[a-f0-9]{64}")))
        return Candidate(name, code, file, digest, asset(file).getString("browser_download_url"))
    }
    private fun download(c:Candidate):File { val d=File(context.cacheDir,"wear-update").apply{mkdirs()};val part=File(d,".${c.file}.part");val out=File(d,c.file);part.delete();out.delete();try{val con=open(c.url);con.inputStream.use{input->val size=con.contentLengthLong;require(size in 1..MAX);val md=MessageDigest.getInstance("SHA-256");var n=0L;BufferedInputStream(input).use{src->FileOutputStream(part).use{dst->val b=ByteArray(32768);while(true){val k=src.read(b);if(k<0)break;n+=k;require(n<=MAX);md.update(b,0,k);dst.write(b,0,k)}}};require(n==size&&hex(md.digest())==c.sha)};require(part.renameTo(out));return out}catch(t:Throwable){part.delete();out.delete();throw t} }
    private fun verify(f:File, code:Long){val flags=PackageManager.GET_SIGNING_CERTIFICATES.toLong();val p=if(Build.VERSION.SDK_INT>=33)context.packageManager.getPackageArchiveInfo(f.path,PackageManager.PackageInfoFlags.of(flags))else @Suppress("DEPRECATION") context.packageManager.getPackageArchiveInfo(f.path,PackageManager.GET_SIGNATURES);require(p!=null&&p.packageName==context.packageName&&p.longVersionCode==code);if(Build.VERSION.SDK_INT>=28){val own=context.packageManager.getPackageInfo(context.packageName,PackageManager.PackageInfoFlags.of(flags));val a=p.signingInfo?.apkContentsSigners.orEmpty().map{hex(MessageDigest.getInstance("SHA-256").digest(it.toByteArray()))}.toSet();val b=own.signingInfo?.apkContentsSigners.orEmpty().map{hex(MessageDigest.getInstance("SHA-256").digest(it.toByteArray()))}.toSet();require(a.isNotEmpty()&&a==b)} }
    private fun transfer(id:String,f:File,c:Candidate){val token="wear-${System.currentTimeMillis()}";val prep=JSONObject().put("token",token).put("versionName",c.name).put("versionCode",c.code).put("apkFile",c.file).put("sha256",c.sha).put("size",f.length()).toString().toByteArray();Tasks.await(Wearable.getMessageClient(context).sendMessage(id,PREPARE,prep),20,TimeUnit.SECONDS);val ch=Tasks.await(Wearable.getChannelClient(context).openChannel(id,CHANNEL),20,TimeUnit.SECONDS);try{DataOutputStream(Tasks.await(Wearable.getChannelClient(context).getOutputStream(ch),30,TimeUnit.SECONDS)).use{o->val h=JSONObject().put("token",token).toString().toByteArray();o.writeInt(h.size);o.write(h);FileInputStream(f).use{i->i.copyTo(o)};o.flush()}}finally{Wearable.getChannelClient(context).close(ch)} }
    private fun node()=runCatching{Tasks.await(Wearable.getNodeClient(context).connectedNodes,15,TimeUnit.SECONDS).firstOrNull()?.id}.getOrNull()
    private fun text(url:String,max:Int):String{val c=open(url);return try{c.inputStream.use{it.readBytes().also{b->require(b.size<=max)}.toString(Charsets.UTF_8)}}finally{c.disconnect()}}
    private fun open(url:String)=(URL(url).openConnection()as HttpURLConnection).apply{require(url.startsWith("https://"));connectTimeout=15000;readTimeout=45000;setRequestProperty("User-Agent","Shift-Tracker-Wear-Updater");require(responseCode==200)}
    private fun state(s:String)=JSONObject().put("type","shift_tracker_wear_update:status").put("state",s).apply{version(context)?.let{put("installedVersion",it.first).put("installedVersionCode",it.second)}}
    private fun hex(b:ByteArray)=b.joinToString(""){"%02x".format(it)}
}
