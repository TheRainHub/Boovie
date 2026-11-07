import AVFoundation
import Capacitor
import Foundation
import MediaPlayer
import UIKit

/// The book player for the app: one book at a time, as a list of its audio files, positioned on the book's own
/// timeline (seconds from the start of the first file). Everything that has to keep working while the WebView sleeps
/// happens here: moving on to the next file, the lock screen and Control Center, the sleep timer, the position saved
/// for a restart and the time counters the statistics are made from. JavaScript gets a "state" event twice a second.
@objc(BoowiePlayerPlugin)
public class BoowiePlayerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BoowiePlayerPlugin"
    public let jsName = "BoowiePlayer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loadBook", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSleep", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "lastSession", returnType: CAPPluginReturnPromise)
    ]

    private static let skipBack = 15.0
    private static let skipForward = 30.0
    private static let defaultsKey = "boowie-player.last"

    private let player = AVPlayer()
    private var bookId: String?
    /// When the book was opened in the player: the counters count from then.
    private var session = 0.0
    private var title = ""
    private var author = ""
    private var artwork: MPMediaItemArtwork?
    private var trackURLs: [URL] = []
    private var trackStarts: [Double] = []
    private var trackDurations: [Double] = []
    private var chapterStarts: [Double] = []
    private var chapterTitles: [String] = []
    private var total = 0.0
    private var index = 0
    private var rate: Float = 1

    /// The listener wants sound (play was pressed); the element may still be loading or seeking.
    private var wantsToPlay = false
    private var resumeAfterInterruption = false
    /// File time to go to once the current item is ready.
    private var pendingSeek: Double?
    private var ended = false
    private var error: String?
    private var currentChapter = -1

    private var playedWall = 0.0
    private var playedMedia = 0.0
    private var lastTick = 0.0
    private var lastPosition = -1.0

    /// Sleep: pause at this wall-clock time (ms since 1970), or at this point of the book (the end of a chapter).
    private var sleepAt = 0.0
    private var sleepAtPosition = -1.0
    private var sleepFired = false

    private var timer: Timer?
    private var statusObservation: NSKeyValueObservation?
    private var controlObservation: NSKeyValueObservation?

    override public func load() {
        let center = NotificationCenter.default
        let session = AVAudioSession.sharedInstance()
        center.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: session)
        center.addObserver(self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification, object: session)
        center.addObserver(self, selector: #selector(itemEnded(_:)), name: .AVPlayerItemDidPlayToEndTime, object: nil)
        DispatchQueue.main.async {
            self.controlObservation = self.player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
                DispatchQueue.main.async {
                    self?.updateNowPlaying()
                    self?.emit()
                }
            }
            self.setupRemoteCommands()
            self.timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.tick() }
        }
    }

    // MARK: - Methods

    @objc func loadBook(_ call: CAPPluginCall) {
        guard let id = call.getString("bookId"), let tracks = call.getArray("tracks", JSObject.self), !tracks.isEmpty else {
            call.reject("bookId and tracks are required")
            return
        }
        var urls: [URL] = []
        var starts: [Double] = []
        var durations: [Double] = []
        var at = 0.0
        for t in tracks {
            guard let path = t["path"] as? String else {
                call.reject("every track needs a path")
                return
            }
            urls.append(path.hasPrefix("file:") ? (URL(string: path) ?? URL(fileURLWithPath: path)) : URL(fileURLWithPath: path))
            starts.append(at)
            let duration = (t["duration"] as? Double) ?? 0
            durations.append(duration)
            at += duration
        }
        var chStarts: [Double] = []
        var chTitles: [String] = []
        for c in call.getArray("chapters", JSObject.self) ?? [] {
            chStarts.append((c["start"] as? Double) ?? 0)
            chTitles.append((c["title"] as? String) ?? "")
        }
        let position = call.getDouble("position") ?? 0
        let autoplay = call.getBool("autoplay") ?? false
        let speed = Float(call.getDouble("rate") ?? 1)
        let bookTitle = call.getString("title") ?? ""
        let bookAuthor = call.getString("author") ?? ""
        let artworkPath = call.getString("artwork")
        let length = at

        DispatchQueue.main.async {
            self.bookId = id
            self.session = (Date().timeIntervalSince1970 * 1000).rounded()
            self.title = bookTitle
            self.author = bookAuthor
            self.artwork = Self.loadArtwork(artworkPath)
            self.trackURLs = urls
            self.trackStarts = starts
            self.trackDurations = durations
            self.chapterStarts = chStarts
            self.chapterTitles = chTitles
            self.total = length
            self.rate = speed
            self.ended = false
            self.error = nil
            self.currentChapter = -1
            self.clearSleep()
            self.resetCounters()
            self.wantsToPlay = autoplay
            if autoplay { self.activateSession() }
            let i = self.trackAt(position)
            self.loadTrack(i, offset: position - starts[i])
            self.save(position)
            self.updateNowPlaying()
            self.emit()
            call.resolve()
        }
    }

    @objc func play(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.startPlaying()
            call.resolve()
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.pausePlaying()
            call.resolve()
        }
    }

    @objc func seek(_ call: CAPPluginCall) {
        let position = call.getDouble("position") ?? 0
        DispatchQueue.main.async {
            self.seekBook(position)
            call.resolve()
        }
    }

    @objc func setRate(_ call: CAPPluginCall) {
        let speed = Float(call.getDouble("rate") ?? 1)
        DispatchQueue.main.async {
            self.rate = speed
            if self.isPlaying { self.player.rate = speed }
            self.updateNowPlaying()
            call.resolve()
        }
    }

    @objc func setSleep(_ call: CAPPluginCall) {
        let at = call.getDouble("at") ?? 0
        let position = call.getDouble("position") ?? -1
        DispatchQueue.main.async {
            self.clearSleep()
            self.player.volume = 1
            if at > 0 {
                self.sleepAt = at
            } else if position >= 0 {
                self.sleepAtPosition = position
            }
            call.resolve()
        }
    }

    @objc func unload(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.wantsToPlay = false
            self.player.pause()
            self.player.replaceCurrentItem(with: nil)
            self.statusObservation = nil
            self.bookId = nil
            self.trackURLs = []
            self.trackStarts = []
            self.trackDurations = []
            self.chapterStarts = []
            self.chapterTitles = []
            self.total = 0
            self.clearSleep()
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            UserDefaults.standard.removeObject(forKey: Self.defaultsKey)
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            call.resolve()
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.state()) }
    }

    /// The book and place playing was last at — written as it plays, so it survives the app being killed.
    @objc func lastSession(_ call: CAPPluginCall) {
        guard let saved = UserDefaults.standard.dictionary(forKey: Self.defaultsKey) else {
            call.resolve([:])
            return
        }
        call.resolve(saved)
    }

    // MARK: - Playback

    private var isPlaying: Bool { player.timeControlStatus == .playing }

    /// Where the listener is on the book's timeline.
    private var position: Double {
        guard bookId != nil, index < trackStarts.count else { return 0 }
        if let pending = pendingSeek { return trackStarts[index] + pending }
        let t = player.currentTime().seconds
        return trackStarts[index] + (t.isFinite ? max(0, t) : 0)
    }

    private func loadTrack(_ i: Int, offset: Double) {
        index = i
        let item = AVPlayerItem(url: trackURLs[i])
        // Speech at other speeds without the chipmunk effect.
        item.audioTimePitchAlgorithm = .timeDomain
        pendingSeek = max(0, min(offset, max(0, trackDurations[i] - 0.25)))
        statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
            DispatchQueue.main.async { self?.statusChanged(item) }
        }
        player.replaceCurrentItem(with: item)
    }

    private func statusChanged(_ item: AVPlayerItem) {
        guard item === player.currentItem else { return }
        switch item.status {
        case .readyToPlay:
            guard let offset = pendingSeek else { return }
            player.seek(to: CMTime(seconds: offset, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    self.pendingSeek = nil
                    if self.wantsToPlay { self.player.playImmediately(atRate: self.rate) }
                    self.updateNowPlaying()
                    self.emit()
                }
            }
        case .failed:
            error = item.error?.localizedDescription ?? "playback error"
            wantsToPlay = false
            pendingSeek = nil
            emit()
        default:
            break
        }
    }

    private func startPlaying() {
        guard bookId != nil, !trackURLs.isEmpty else { return }
        if ended {
            ended = false
            seekBook(0)
        }
        activateSession()
        wantsToPlay = true
        if player.currentItem == nil {
            let pos = position
            let i = trackAt(pos)
            loadTrack(i, offset: pos - trackStarts[i])
        } else if pendingSeek == nil {
            player.playImmediately(atRate: rate)
        }
        updateNowPlaying()
    }

    private func pausePlaying() {
        wantsToPlay = false
        player.pause()
        save(position)
        updateNowPlaying()
        emit()
    }

    private func seekBook(_ target: Double) {
        guard !trackStarts.isEmpty else { return }
        let pos = max(0, min(target, max(0, total - 0.25)))
        ended = false
        let i = trackAt(pos)
        let offset = pos - trackStarts[i]
        // A seek is not playback: the counters start again from the new place.
        lastPosition = -1
        if i == index, let item = player.currentItem, item.status == .readyToPlay, pendingSeek == nil {
            player.seek(to: CMTime(seconds: offset, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
                DispatchQueue.main.async {
                    self?.updateNowPlaying()
                    self?.emit()
                }
            }
        } else {
            loadTrack(i, offset: offset)
        }
        save(pos)
        updateNowPlaying()
        emit()
    }

    @objc private func itemEnded(_ note: Notification) {
        DispatchQueue.main.async {
            guard let item = note.object as? AVPlayerItem, item === self.player.currentItem else { return }
            if self.index + 1 < self.trackURLs.count {
                self.loadTrack(self.index + 1, offset: 0)
            } else {
                self.ended = true
                self.wantsToPlay = false
                self.save(self.total)
                self.updateNowPlaying()
                self.emit()
            }
        }
    }

    private func activateSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, policy: .longFormAudio)
        try? session.setActive(true)
    }

    @objc private func interrupted(_ note: Notification) {
        guard let info = note.userInfo, let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        DispatchQueue.main.async {
            if type == .began {
                // A call or an alarm: remember to go on if the system says so afterwards.
                self.resumeAfterInterruption = self.wantsToPlay
                self.pausePlaying()
            } else if let options = info[AVAudioSessionInterruptionOptionKey] as? UInt,
                      AVAudioSession.InterruptionOptions(rawValue: options).contains(.shouldResume), self.resumeAfterInterruption {
                self.resumeAfterInterruption = false
                self.startPlaying()
            }
        }
    }

    @objc private func routeChanged(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
        // Headphones out: pause instead of playing out loud.
        DispatchQueue.main.async { self.pausePlaying() }
    }

    // MARK: - Timer, sleep, counters

    private func tick() {
        guard bookId != nil else { return }
        let now = CACurrentMediaTime()
        let pos = position
        if isPlaying {
            if lastTick > 0 { playedWall += now - lastTick }
            if lastPosition >= 0, pos > lastPosition, pos - lastPosition < 15 { playedMedia += pos - lastPosition }
            lastPosition = pos
            sleepTick(pos)
            let chapter = chapterIndex(at: pos)
            if chapter != currentChapter {
                currentChapter = chapter
                updateNowPlaying()
            }
            save(pos)
            emit()
        } else {
            lastPosition = -1
        }
        lastTick = now
    }

    private func sleepTick(_ pos: Double) {
        if sleepAt > 0 {
            let left = sleepAt - Date().timeIntervalSince1970 * 1000
            if left <= 0 {
                pausePlaying()
                player.volume = 1
                clearSleep()
                sleepFired = true
            } else if left < 10_000 {
                // The last ten seconds fade out.
                player.volume = max(0.05, Float(left / 10_000))
            }
        } else if sleepAtPosition >= 0, pos >= sleepAtPosition - 0.3 {
            pausePlaying()
            clearSleep()
            sleepFired = true
        }
    }

    private func clearSleep() {
        sleepAt = 0
        sleepAtPosition = -1
    }

    private func resetCounters() {
        playedWall = 0
        playedMedia = 0
        lastPosition = -1
        lastTick = 0
    }

    private func trackAt(_ pos: Double) -> Int {
        var i = 0
        for (k, start) in trackStarts.enumerated() where start <= pos + 0.001 { i = k }
        return i
    }

    private func chapterIndex(at pos: Double) -> Int {
        var i = -1
        for (k, start) in chapterStarts.enumerated() where start <= pos + 0.001 { i = k }
        return i
    }

    private func save(_ pos: Double) {
        guard let id = bookId else { return }
        UserDefaults.standard.set(["bookId": id, "position": pos, "updatedAt": Date().timeIntervalSince1970 * 1000], forKey: Self.defaultsKey)
    }

    // MARK: - Lock screen

    private func setupRemoteCommands() {
        let rc = MPRemoteCommandCenter.shared()
        rc.playCommand.addTarget { [weak self] _ in
            self?.startPlaying()
            return .success
        }
        rc.pauseCommand.addTarget { [weak self] _ in
            self?.pausePlaying()
            return .success
        }
        rc.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            if self.wantsToPlay { self.pausePlaying() } else { self.startPlaying() }
            return .success
        }
        rc.skipBackwardCommand.preferredIntervals = [NSNumber(value: Self.skipBack)]
        rc.skipBackwardCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            self.seekBook(self.position - Self.skipBack)
            return .success
        }
        rc.skipForwardCommand.preferredIntervals = [NSNumber(value: Self.skipForward)]
        rc.skipForwardCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            self.seekBook(self.position + Self.skipForward)
            return .success
        }
        // The lock-screen scrubber is the current chapter, as in the app.
        rc.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self = self, let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            let ch = self.chapterIndex(at: self.position)
            self.seekBook((ch >= 0 ? self.chapterStarts[ch] : 0) + e.positionTime)
            return .success
        }
        rc.nextTrackCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            let ch = self.chapterIndex(at: self.position)
            guard ch + 1 < self.chapterStarts.count else { return .noSuchContent }
            self.seekBook(self.chapterStarts[ch + 1])
            return .success
        }
        rc.previousTrackCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            let pos = self.position
            let ch = max(0, self.chapterIndex(at: pos))
            guard !self.chapterStarts.isEmpty else { return .noSuchContent }
            // Like a CD player: the first press goes back to the start of the chapter.
            let target = pos - self.chapterStarts[ch] > 3 || ch == 0 ? self.chapterStarts[ch] : self.chapterStarts[ch - 1]
            self.seekBook(target)
            return .success
        }
    }

    private func updateNowPlaying() {
        guard bookId != nil else {
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            return
        }
        let pos = position
        let ch = chapterIndex(at: pos)
        let start = ch >= 0 ? chapterStarts[ch] : 0
        let end = ch >= 0 && ch + 1 < chapterStarts.count ? chapterStarts[ch + 1] : total
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: ch >= 0 && !chapterTitles[ch].isEmpty ? chapterTitles[ch] : title,
            MPMediaItemPropertyArtist: author,
            MPMediaItemPropertyAlbumTitle: title,
            MPMediaItemPropertyPlaybackDuration: max(0, end - start),
            MPNowPlayingInfoPropertyElapsedPlaybackTime: max(0, pos - start),
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? Double(rate) : 0.0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: Double(rate)
        ]
        if let artwork = artwork { info[MPMediaItemPropertyArtwork] = artwork }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    private static func loadArtwork(_ path: String?) -> MPMediaItemArtwork? {
        guard let path = path else { return nil }
        let url = path.hasPrefix("file:") ? URL(string: path) : URL(fileURLWithPath: path)
        guard let file = url?.path, let image = UIImage(contentsOfFile: file) else { return nil }
        return MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    }

    // MARK: - Events

    private func state() -> [String: Any] {
        var s: [String: Any] = [
            "session": session,
            "loaded": bookId != nil && !trackURLs.isEmpty,
            "position": position,
            "index": index,
            "duration": total,
            "playing": isPlaying,
            "buffering": wantsToPlay && (pendingSeek != nil || player.timeControlStatus == .waitingToPlayAtSpecifiedRate),
            "ended": ended,
            "rate": Double(rate),
            "playedWall": playedWall,
            "playedMedia": playedMedia
        ]
        if let id = bookId { s["bookId"] = id }
        if let error = error { s["error"] = error }
        if sleepFired { s["sleepFired"] = true }
        return s
    }

    private func emit() {
        guard bookId != nil else { return }
        notifyListeners("state", data: state())
        sleepFired = false
        error = nil
    }
}
