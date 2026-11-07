package app.boowie.player;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/**
 * The book player for the app: one book at a time, as a playlist of its audio files, positioned on the book's own
 * timeline (seconds from the start of the first file). The playback service does everything that has to keep working
 * while the WebView sleeps or is gone (moving on to the next file, the lock screen, the sleep timer, the saved place,
 * the counters the statistics are made from); this plugin passes the app's commands to it and sends the app a
 * "state" event about twice a second while the book plays.
 */
@CapacitorPlugin(name = "BoowiePlayer")
public class BoowiePlayerPlugin extends Plugin {

    private static final long TICK_MS = 500;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<Runnable> pending = new ArrayList<>();
    @Nullable
    private ListenableFuture<MediaController> future;
    @Nullable
    private MediaController controller;

    private final Player.Listener listener = new Player.Listener() {
        @Override
        public void onEvents(@NonNull Player player, @NonNull Player.Events events) {
            emit();
        }
    };

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            MediaController c = controller;
            if (c != null && c.isPlaying()) emit();
            main.postDelayed(this, TICK_MS);
        }
    };

    @Override
    public void load() {
        main.post(this::connect);
        main.postDelayed(tick, TICK_MS);
    }

    @Override
    protected void handleOnDestroy() {
        main.removeCallbacks(tick);
        if (controller != null) controller.removeListener(listener);
        if (future != null) MediaController.releaseFuture(future);
        controller = null;
        future = null;
    }

    private void connect() {
        if (future != null) return;
        Context context = getContext();
        SessionToken token = new SessionToken(context, new ComponentName(context, PlaybackService.class));
        future = new MediaController.Builder(context, token).buildAsync();
        future.addListener(
            () -> {
                try {
                    controller = future.get();
                    controller.addListener(listener);
                    for (Runnable r : pending) r.run();
                    pending.clear();
                    emit();
                } catch (Exception e) {
                    Logger.error("BoowiePlayer", "could not connect to the playback service", e);
                    future = null;
                }
            },
            main::post
        );
    }

    /** Run on the main thread once the controller is there. */
    private void withController(PluginCall call, ControllerTask task) {
        main.post(() -> {
            Runnable run = () -> {
                try {
                    task.run(controller);
                    call.resolve();
                } catch (Exception e) {
                    call.reject(e.getMessage(), e);
                }
            };
            if (controller != null) run.run();
            else {
                pending.add(run);
                connect();
            }
        });
    }

    private interface ControllerTask {
        void run(MediaController c) throws Exception;
    }

    @PluginMethod
    public void loadBook(PluginCall call) {
        String id = call.getString("bookId");
        JSArray tracks = call.getArray("tracks");
        if (id == null || tracks == null || tracks.length() == 0) {
            call.reject("bookId and tracks are required");
            return;
        }
        String title = call.getString("title", "");
        String author = call.getString("author", "");
        String artwork = call.getString("artwork");
        double position = call.getDouble("position", 0.0);
        double rate = call.getDouble("rate", 1.0);
        boolean autoplay = Boolean.TRUE.equals(call.getBoolean("autoplay", false));

        try {
            int n = tracks.length();
            double[] starts = new double[n];
            double[] durations = new double[n];
            List<String> paths = new ArrayList<>();
            double at = 0;
            for (int i = 0; i < n; i++) {
                JSONObject t = tracks.getJSONObject(i);
                paths.add(t.getString("path"));
                starts[i] = at;
                durations[i] = t.optDouble("duration", 0);
                at += durations[i];
            }
            JSArray chapters = call.getArray("chapters", new JSArray());
            double[] chStarts = new double[chapters.length()];
            String[] chTitles = new String[chapters.length()];
            for (int i = 0; i < chapters.length(); i++) {
                JSONObject c = chapters.getJSONObject(i);
                chStarts[i] = c.optDouble("start", 0);
                chTitles[i] = c.optString("title", "");
            }

            List<MediaItem> items = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                // A file that is exactly one chapter shows the chapter's name; a file with several, the book's.
                String itemTitle = title;
                int inside = 0;
                for (int k = 0; k < chStarts.length; k++) {
                    if (chStarts[k] >= starts[i] - 0.5 && chStarts[k] < starts[i] + durations[i] - 0.5) {
                        inside++;
                        itemTitle = chTitles[k];
                    }
                }
                if (inside != 1) itemTitle = title;
                MediaMetadata.Builder meta = new MediaMetadata.Builder().setTitle(itemTitle).setArtist(author).setAlbumTitle(title);
                if (artwork != null) meta.setArtworkUri(Uri.parse(artwork));
                items.add(new MediaItem.Builder().setMediaId(id + ":" + i).setUri(Uri.parse(paths.get(i))).setMediaMetadata(meta.build()).build());
            }

            final double length = at;
            withController(call, (c) -> {
                Book.open(id, starts, durations, length);
                int index = Book.trackAt(position);
                c.setVolume(1f);
                c.setMediaItems(items, index, Book.offsetMs(position, index));
                c.setPlaybackSpeed((float) rate);
                c.prepare();
                if (autoplay) c.play();
                Book.save(getContext(), position);
                emit();
            });
        } catch (Exception e) {
            call.reject(e.getMessage(), e);
        }
    }

    @PluginMethod
    public void play(PluginCall call) {
        withController(call, (c) -> {
            if (Book.id == null || c.getMediaItemCount() == 0) return;
            if (Book.ended || c.getPlaybackState() == Player.STATE_ENDED) {
                Book.ended = false;
                Book.lastPosition = -1;
                c.seekTo(0, 0);
            }
            if (c.getPlaybackState() == Player.STATE_IDLE) c.prepare();
            c.play();
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        withController(call, (c) -> {
            c.pause();
            if (Book.id != null && c.getMediaItemCount() > 0) Book.save(getContext(), Book.position(c));
        });
    }

    @PluginMethod
    public void seek(PluginCall call) {
        double position = call.getDouble("position", 0.0);
        withController(call, (c) -> {
            if (Book.trackStarts.length == 0 || c.getMediaItemCount() == 0) return;
            double to = Math.max(0, Math.min(position, Math.max(0, Book.total - 0.25)));
            Book.ended = false;
            int index = Book.trackAt(to);
            c.seekTo(index, Book.offsetMs(to, index));
            // A seek is not playback: the counters start again from the new place.
            Book.lastPosition = -1;
            Book.save(getContext(), to);
            emit();
        });
    }

    @PluginMethod
    public void setRate(PluginCall call) {
        double rate = call.getDouble("rate", 1.0);
        withController(call, (c) -> c.setPlaybackSpeed((float) rate));
    }

    @PluginMethod
    public void setSleep(PluginCall call) {
        Long at = call.getLong("at");
        Double position = call.getDouble("position");
        withController(call, (c) -> {
            Book.clearSleep();
            c.setVolume(1f);
            if (at != null && at > 0) Book.sleepAt = at;
            else if (position != null && position >= 0) Book.sleepAtPosition = position;
        });
    }

    @PluginMethod
    public void unload(PluginCall call) {
        withController(call, (c) -> {
            c.stop();
            c.clearMediaItems();
            Book.close();
            Book.prefs(getContext()).edit().clear().apply();
        });
    }

    @PluginMethod
    public void getState(PluginCall call) {
        main.post(() -> call.resolve(state()));
    }

    /** The book and place playing was last at — written as it plays, so it survives the app being killed. */
    @PluginMethod
    public void lastSession(PluginCall call) {
        SharedPreferences p = Book.prefs(getContext());
        JSObject out = new JSObject();
        String id = p.getString("bookId", null);
        if (id != null) {
            out.put("bookId", id);
            try {
                out.put("position", Double.parseDouble(p.getString("position", "0")));
            } catch (NumberFormatException e) {
                out.put("position", 0);
            }
            out.put("updatedAt", p.getLong("updatedAt", 0));
        }
        call.resolve(out);
    }

    private JSObject state() {
        JSObject s = new JSObject();
        MediaController c = controller;
        boolean loaded = c != null && Book.id != null && c.getMediaItemCount() > 0;
        if (Book.id != null) s.put("bookId", Book.id);
        s.put("session", Book.session);
        s.put("loaded", loaded);
        s.put("position", loaded ? Book.position(c) : 0);
        s.put("index", loaded ? c.getCurrentMediaItemIndex() : 0);
        s.put("duration", Book.total);
        s.put("playing", loaded && c.isPlaying());
        s.put("buffering", loaded && c.getPlayWhenReady() && c.getPlaybackState() == Player.STATE_BUFFERING);
        s.put("ended", Book.ended);
        s.put("rate", c != null ? c.getPlaybackParameters().speed : 1);
        s.put("playedWall", Book.playedWall);
        s.put("playedMedia", Book.playedMedia);
        if (Book.error != null) s.put("error", Book.error);
        if (Book.sleepFired) s.put("sleepFired", true);
        return s;
    }

    private void emit() {
        if (Book.id == null) return;
        notifyListeners("state", state());
        Book.sleepFired = false;
        Book.error = null;
    }
}
