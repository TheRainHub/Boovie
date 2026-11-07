package app.boowie.player;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.CommandButton;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import com.google.common.collect.ImmutableList;

/**
 * Plays the book in a media session: it keeps going with the screen off and the app in the background, shows the
 * notification and the lock screen controls (15 s back, play/pause, 30 s forward), pauses for calls and when the
 * headphones come out. The plugin drives it through a MediaController; the service itself keeps the counters, the
 * sleep timer and the saved place, so they go on even when the app's screen has been closed.
 */
public class PlaybackService extends MediaSessionService {

    static final long SKIP_BACK_MS = 15_000;
    static final long SKIP_FORWARD_MS = 30_000;
    private static final long TICK_MS = 500;
    private static final long FADE_MS = 10_000;

    @Nullable
    private MediaSession session;
    @Nullable
    private ExoPlayer player;
    private final Handler main = new Handler(Looper.getMainLooper());
    private long lastTick;
    private long lastSave;
    private static final long SAVE_MS = 2_000;

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            onTick();
            main.postDelayed(this, TICK_MS);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        player = new ExoPlayer.Builder(this)
            .setAudioAttributes(
                new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(),
                /* handleAudioFocus= */ true
            )
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_LOCAL)
            .setSeekBackIncrementMs(SKIP_BACK_MS)
            .setSeekForwardIncrementMs(SKIP_FORWARD_MS)
            .build();
        player.addListener(
            new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int state) {
                    if (state == Player.STATE_ENDED) {
                        Book.ended = true;
                        Book.save(PlaybackService.this, Book.total);
                    }
                }

                @Override
                public void onIsPlayingChanged(boolean isPlaying) {
                    if (!isPlaying && Book.id != null && player != null && player.getMediaItemCount() > 0) {
                        Book.save(PlaybackService.this, Book.position(player));
                    }
                }

                @Override
                public void onPositionDiscontinuity(
                    @NonNull Player.PositionInfo oldPosition,
                    @NonNull Player.PositionInfo newPosition,
                    int reason
                ) {
                    // A seek (from the app, the notification or a headset) is not listening.
                    if (reason == Player.DISCONTINUITY_REASON_SEEK) Book.lastPosition = -1;
                }

                @Override
                public void onPlayerError(@NonNull PlaybackException e) {
                    Book.error = e.getMessage() != null ? e.getMessage() : "playback error";
                }
            }
        );

        MediaSession.Builder builder = new MediaSession.Builder(this, player).setMediaButtonPreferences(
            ImmutableList.of(
                new CommandButton.Builder(CommandButton.ICON_SKIP_BACK_15)
                    .setPlayerCommand(Player.COMMAND_SEEK_BACK)
                    .setDisplayName("−15 s")
                    .setSlots(CommandButton.SLOT_BACK)
                    .build(),
                new CommandButton.Builder(CommandButton.ICON_SKIP_FORWARD_30)
                    .setPlayerCommand(Player.COMMAND_SEEK_FORWARD)
                    .setDisplayName("+30 s")
                    .setSlots(CommandButton.SLOT_FORWARD)
                    .build()
            )
        );
        // A tap on the notification opens the app.
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) {
            builder.setSessionActivity(
                PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT)
            );
        }
        session = builder.build();
        main.postDelayed(tick, TICK_MS);
    }

    private void onTick() {
        ExoPlayer p = player;
        if (p == null || Book.id == null || p.getMediaItemCount() == 0) {
            lastTick = 0;
            return;
        }
        long now = SystemClock.elapsedRealtime();
        double pos = Book.position(p);
        if (p.isPlaying()) {
            if (lastTick > 0) Book.playedWall += (now - lastTick) / 1000.0;
            if (Book.lastPosition >= 0 && pos > Book.lastPosition && pos - Book.lastPosition < 15) {
                Book.playedMedia += pos - Book.lastPosition;
            }
            Book.lastPosition = pos;
            sleepTick(p, pos);
            // The place for a restart after the app was killed (pauses and seeks are saved as they happen).
            if (now - lastSave >= SAVE_MS) {
                lastSave = now;
                Book.save(this, pos);
            }
        } else {
            Book.lastPosition = -1;
        }
        // The fade of a sleep timer that was then cancelled.
        if (Book.sleepAt == 0 && p.getVolume() < 1f) p.setVolume(1f);
        lastTick = now;
    }

    private void sleepTick(ExoPlayer p, double pos) {
        if (Book.sleepAt > 0) {
            long left = Book.sleepAt - System.currentTimeMillis();
            if (left <= 0) {
                Book.clearSleep();
                Book.sleepFired = true;
                p.pause();
                p.setVolume(1f);
                Book.save(this, Book.position(p));
            } else if (left < FADE_MS) {
                // The last ten seconds fade out.
                p.setVolume(Math.max(0.05f, left / (float) FADE_MS));
            }
        } else if (Book.sleepAtPosition >= 0 && pos >= Book.sleepAtPosition - 0.3) {
            Book.clearSleep();
            Book.sleepFired = true;
            p.pause();
            Book.save(this, pos);
        }
    }

    @Nullable
    @Override
    public MediaSession onGetSession(@NonNull MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    @Override
    public void onTaskRemoved(@Nullable Intent rootIntent) {
        // Swiping the app away keeps a playing book going; a paused one has nothing to keep the service for.
        if (player == null) return;
        if (!player.getPlayWhenReady() || player.getMediaItemCount() == 0 || player.getPlaybackState() == Player.STATE_ENDED) {
            stopSelf();
        }
    }

    @Override
    public void onDestroy() {
        main.removeCallbacks(tick);
        if (player != null) {
            if (Book.id != null && player.getMediaItemCount() > 0) Book.save(this, Book.position(player));
            player.release();
            player = null;
        }
        if (session != null) {
            session.release();
            session = null;
        }
        // The book is no longer in the player; the next screen opens it again from the saved place.
        Book.close();
        super.onDestroy();
    }
}
