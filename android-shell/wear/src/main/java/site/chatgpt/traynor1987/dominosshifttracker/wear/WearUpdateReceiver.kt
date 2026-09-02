package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.ChannelClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject
import java.io.*
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

private const val PREPARE="/shift-tracker/update/wear/prepare"; private const val STATUS="/shift-tracker/update/wear/status"; private const val CHANNEL="/shift-tracker/update/wear/apk"; private const val VERSION="/shift-tracker/update/wear/version"
class WearUpdateReceiver:com.google.android.gms.wearable.WearableListenerService(){
 override fun onMessageReceived(e:MessageEvent){if(e.path==VERSION){val i=packageManager.getPackageInfo(packageName,0);val c=if(Build.VERSION.SDK_INT>=28)i.longVersionCode else @Suppress("DEPRECATION")i.versionCode.toLong();Wearable.getMessageClient(this).sendMessage(e.sourceNodeId,STATUS,JSONObject().put("kind","version").put("versionName",i.versionName).put("versionCode",c).toString().toByteArray())}else if(e.path==PREPARE){getSharedPreferences("wear_update",0).edit().putString("meta",e.data.toString(Charsets.UTF_8)).apply()}}
 override fun onChannelOpened(ch:ChannelClient.Channel){if(ch.path==CHANNEL)Thread{receive(ch)}.start()}
 private fun receive(ch:ChannelClient.Channel){val meta=runCatching{JSONObject(getSharedPreferences("wear_update",0).getString("meta",null)?:error("missing"))}.getOrNull()?:return;val dir=File(cacheDir,"wear-update").apply{mkdirs()};val f=File(dir,meta.getString("apkFile"));val p=File(dir,".${f.name}.part");p.delete();f.delete();try{DataInputStream(Tasks.await(Wearable.getChannelClient(this).getInputStream(ch),30,TimeUnit.SECONDS)).use{i->val z=i.readInt();require(z in 2..2048);val h=ByteArray(z);i.readFully(h);require(JSONObject(h.toString(Charsets.UTF_8)).optString("token")==meta.getString("token"));val d=MessageDigest.getInstance("SHA-256");FileOutputStream(p).use{o->val b=ByteArray(32768);while(true){val n=i.read(b);if(n<0)break;d.update(b,0,n);o.write(b,0,n)}};require(hex(d.digest())==meta.getString("sha256"))};require(p.renameTo(f));val a=packageManager.getPackageArchiveInfo(f.path,PackageManager.GET_SIGNING_CERTIFICATES)?:error("bad");require(a.packageName==packageName&&a.longVersionCode==meta.getLong("versionCode"));getSharedPreferences("wear_update",0).edit().putString("ready",f.path).apply();message(ch.nodeId,"ready_to_install","Wear update ready to install")}catch(_:Throwable){p.delete();f.delete();message(ch.nodeId,"failed","Wear update verification failed") }finally{Wearable.getChannelClient(this).close(ch)}}
 private fun message(n:String,s:String,m:String){Wearable.getMessageClient(this).sendMessage(n,STATUS,JSONObject().put("state",s).put("message",m).toString().toByteArray())};private fun hex(b:ByteArray)=b.joinToString(""){"%02x".format(it)}
}
class WearUpdateActivity:android.app.Activity(){override fun onCreate(b:android.os.Bundle?){super.onCreate(b);val f=getSharedPreferences("wear_update",0).getString("ready",null)?.let(::File);if(f?.isFile!=true){finish();return};val button=android.widget.Button(this).apply{text="INSTALL SHIFT TRACKER UPDATE";setOnClickListener{if(Build.VERSION.SDK_INT>=26&&!packageManager.canRequestPackageInstalls()){startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:$packageName")));return@setOnClickListener};val u=FileProvider.getUriForFile(this@WearUpdateActivity,"$packageName.fileprovider",f);startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(u,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))}};setContentView(button)}}
