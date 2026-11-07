package app.boowie.player;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.Nullable;
import androidx.media3.common.Player;

/**
 * The book being played. The plugin and the playback service share it (they run in the same process): the plugin
 * fills it when a book is opened, the service keeps it going — counters, sleep timer, saved place — even after the
 * app's screen is gone, for example when it was swiped away while the book plays.
 */
final class Book {

    static final String PREFS = "boowie-player";

    @Nullable
    static String id;
    /** When the book was opened in the player: the counters below count from then. */
    static long session;
    static double[] trackStarts = new double[0];
    static double[] trackDurations = new double[0];
    static double total;

    /** Seconds of playing by the clock and of the book heard, since {@link #session}. */
    static double playedWall;
    static double playedMedia;
    /** The place at the last tick, or -1 when the next tick should not count (paused, or just moved). */
    static double lastPosition = -1;

    static boolean ended;
    @Nullable
    static String error;

    /** Sleep: pause at this wall-clock time (ms), or at this point of the book (the end of a chapter). */
    static long sleepAt;
    static double sleepAtPosition = -1;
    static boolean sleepFired;

    private Book() {}

    static void open(String bookId, double[] starts, double[] durations, double length) {
        id = bookId;
        session = System.currentTimeMillis();
        trackStarts = starts;
        trackDurations = durations;
        total = length;
        playedWall = 0;
        playedMedia = 0;
        lastPosition = -1;
        ended = false;
        error = null;
        clearSleep();
    }

    static void close() {
        id = null;
        trackStarts = new double[0];
        trackDurations = new double[0];
        total = 0;
        lastPosition = -1;
        ended = false;
        error = null;
        clearSleep();
    }

    static void clearSleep() {
        sleepAt = 0;
        sleepAtPosition = -1;
    }

    static int trackAt(double position) {
        int index = 0;
        for (int i = 0; i < trackStarts.length; i++) {
            if (trackStarts[i] <= position + 0.001) index = i;
        }
        return index;
    }

    static long offsetMs(double position, int index) {
        double offset = position - trackStarts[index];
        double max = Math.max(0, trackDurations[index] - 0.25);
        return Math.round(Math.max(0, Math.min(offset, max)) * 1000);
    }

    /** Where the player is on the book's timeline. */
    static double position(Player p) {
        int index = p.getCurrentMediaItemIndex();
        if (id == null || index < 0 || index >= trackStarts.length) return 0;
        return trackStarts[index] + Math.max(0, p.getCurrentPosition()) / 1000.0;
    }

    static void save(Context context, double position) {
        if (id == null) return;
        prefs(context)
            .edit()
            .putString("bookId", id)
            .putString("position", String.valueOf(position))
            .putLong("updatedAt", System.currentTimeMillis())
            .apply();
    }

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
