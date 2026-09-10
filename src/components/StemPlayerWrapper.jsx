import React, { useEffect, useState } from 'react';
import { Badge, Box, Button, Flex, IconButton, Progress, Slider, Text, TextField } from '@radix-ui/themes';
import { supabase } from '../utils/supabase';
import { getJobForText, queueBackingTrack, updateText } from '../utils/storage';
import { getMinutesLeft, splitIntoStems } from '../utils/stemSplit';
import { loadSettings, saveSettings } from '../utils/practiceSettings';
import { displayName, inMixOrder, roleFor } from '../utils/stemRoles';

// Left, middle, right is all the panning a practice mix needs, and three taps
// take far less room than a slider on a phone.
const PAN_POSITIONS = [
    { value: -1, label: 'L', title: 'Pan this track left' },
    { value: 0, label: 'C', title: 'Put this track in the middle' },
    { value: 1, label: 'R', title: 'Pan this track right' }
];

const StemPlayerWrapper = ({ stems = [], setStems, textId, youtubeUrl = '', onStemsUpdate, isVisible = true, engine }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [splitProgress, setSplitProgress] = useState(null); // { percent, message }
    const [splitError, setSplitError] = useState(null);
    const [minutesLeft, setMinutesLeft] = useState(null); // null until the API answers, and when it isn't configured
    // src -> { volume, muted }, remembered from the last time this song was open
    const [levels, setLevels] = useState(() => loadSettings(textId).mix || {});
    const [job, setJob] = useState(null); // the backing track fetch, when one is running
    // Null until the field is touched, so the song's own link fills it in
    const [linkDraft, setLinkDraft] = useState(null);
    const [fetchError, setFetchError] = useState(null);
    // The tools open themselves for a song that has nothing to mix yet
    const [areToolsOpen, setAreToolsOpen] = useState(stems.length === 0);
    const link = linkDraft === null ? youtubeUrl : linkDraft;

    const levelFor = (stem) => ({
        volume: stem.volume ?? 1,
        muted: !!stem.muted,
        pan: stem.pan ?? 0,
        ...levels[stem.src]
    });

    const setLevel = (index, stem, next) => {
        const merged = { ...levels, [stem.src]: next };
        setLevels(merged);
        saveSettings(textId, { mix: merged });
        if (!engine) return;
        engine.setStemVolume(index, next.volume);
        engine.setStemMuted(index, next.muted);
        engine.setStemPan(index, next.pan ?? 0);
    };

    // The engine arrives after the tracks have loaded, so the remembered mix is
    // pushed into it here rather than when the sliders were last moved.
    useEffect(() => {
        if (!engine) return;
        stems.forEach((stem, index) => {
            const level = levels[stem.src];
            if (!level) return;
            engine.setStemVolume(index, level.volume);
            engine.setStemMuted(index, level.muted);
            engine.setStemPan(index, level.pan ?? 0);
        });
    }, [engine, stems, levels]);

    useEffect(() => {
        getMinutesLeft().then(setMinutesLeft);
    }, []);

    // While a YouTube fetch is queued or running, follow it here
    useEffect(() => {
        if (!textId) return undefined;
        let cancelled = false;
        let timer;

        let wasRunning = false;

        const poll = async () => {
            const latest = await getJobForText(textId);
            if (cancelled) return;
            setJob(latest);

            const isRunning = latest?.status === 'queued' || latest?.status === 'running';
            if (isRunning) {
                wasRunning = true;
                timer = setTimeout(poll, 8000);
            } else if (wasRunning && latest?.status === 'done' && onStemsUpdate) {
                // The stems landed while the song was open, so pick them up
                wasRunning = false;
                onStemsUpdate();
            }
        };
        poll();

        return () => { cancelled = true; clearTimeout(timer); };
    }, [textId, onStemsUpdate]);

    const handleFileUpload = async (event) => {
        const files = Array.from(event.target.files);
        if (!files.length) return;

        // Validate textId exists
        if (!textId) {
            console.error('[StemPlayerWrapper] Cannot upload: textId is undefined');
            alert('Error: Cannot upload stems - text ID is missing. Please make sure you have saved this text first.');
            event.target.value = '';
            return;
        }

        console.log('[StemPlayerWrapper] Starting upload of', files.length, 'file(s) for textId:', textId);
        setIsUploading(true);

        try {
            const newStems = [];

            for (const file of files) {
                console.log('[StemPlayerWrapper] Uploading file:', file.name, 'size:', file.size, 'type:', file.type);

                // Sanitize filename to remove invalid characters
                // Supabase Storage doesn't allow: [ ] and other special characters
                const sanitizedFileName = file.name.replace(/[[\]]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');

                // 1. Upload file to Supabase Storage
                const fileName = `${textId}/${Date.now()}-${sanitizedFileName}`;
                console.log('[StemPlayerWrapper] Storage path:', fileName);

                const { data, error } = await supabase.storage
                    .from('stems')
                    .upload(fileName, file, {
                        cacheControl: '3600',
                        upsert: false
                    });

                if (error) {
                    console.error('[StemPlayerWrapper] Upload error for', file.name, ':', error);
                    console.error('[StemPlayerWrapper] Error details:', JSON.stringify(error, null, 2));

                    let errorMessage = `Failed to upload ${file.name}: ${error.message}`;

                    // Provide specific guidance based on error type
                    if (error.message?.includes('new row violates row-level security policy') ||
                        error.message?.includes('permission') ||
                        error.message?.includes('policy')) {
                        errorMessage += '\n\nPossible issue: Storage bucket permissions are not configured correctly.';
                        errorMessage += '\nPlease check your Supabase storage bucket policies.';
                    } else if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
                        errorMessage += '\n\nThe "stems" bucket does not exist.';
                        errorMessage += '\nPlease create it in your Supabase dashboard (Storage > New bucket > Name: stems, Public: ON).';
                    }

                    alert(errorMessage);
                    continue;
                }

                console.log('[StemPlayerWrapper] Upload successful:', data);

                // 2. Get public URL
                const { data: { publicUrl } } = supabase.storage
                    .from('stems')
                    .getPublicUrl(fileName);

                console.log('[StemPlayerWrapper] Public URL:', publicUrl);

                newStems.push({
                    label: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
                    src: publicUrl,
                    volume: 1.0,
                    muted: false,
                    color: getRandomColor(),
                    storagePath: fileName // Store path for potential deletion later
                });
            }

            if (newStems.length > 0) {
                const updatedStems = [...stems, ...newStems];
                console.log('[StemPlayerWrapper] Setting stems:', updatedStems);
                setStems(updatedStems);

                // 3. Save metadata to DB
                if (textId) {
                    console.log('[StemPlayerWrapper] Saving to database...');
                    await updateText(textId, { stems: updatedStems });
                    console.log('[StemPlayerWrapper] Database update complete');

                    // 4. Refresh parent data to ensure sync
                    if (onStemsUpdate) {
                        console.log('[StemPlayerWrapper] Triggering parent data refresh...');
                        await onStemsUpdate();
                    }
                }
            }
        } catch (error) {
            console.error('[StemPlayerWrapper] Error processing uploads:', error);
            console.error('[StemPlayerWrapper] Error stack:', error.stack);
            alert('An error occurred while uploading files. Check console for details.');
        } finally {
            setIsUploading(false);
            // Reset file input
            event.target.value = '';
        }
    };

    // Send a full song to LALAL.AI and keep the vocal and backing stems
    const handleSplitUpload = async (event) => {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;

        if (!textId) {
            alert('Save this song before splitting a track for it.');
            return;
        }

        setSplitError(null);
        setSplitProgress({ percent: 0, message: 'Starting…' });

        try {
            const newStems = await splitIntoStems(file, {
                textId,
                onProgress: ({ percent, message }) => setSplitProgress({ percent, message })
            });

            const updatedStems = [...stems, ...newStems];
            setStems(updatedStems);
            await updateText(textId, { stems: updatedStems });
            if (onStemsUpdate) await onStemsUpdate();
            getMinutesLeft().then(setMinutesLeft);
        } catch (error) {
            console.error('[StemPlayerWrapper] Split failed:', error);
            setSplitError(error.message);
        } finally {
            setSplitProgress(null);
        }
    };

    // The other route: StemDeck downloads and separates the song on your own
    // machine. Nothing happens here beyond queueing the work for it.
    const handleQueueFetch = async () => {
        if (!textId) {
            alert('Save this song before fetching a backing track for it.');
            return;
        }
        const url = link.trim();
        if (!url) return;

        setFetchError(null);
        try {
            setJob(await queueBackingTrack(textId, url));
        } catch (error) {
            console.error('[StemPlayerWrapper] Could not queue the fetch:', error);
            setFetchError('Could not queue the fetch. If this database has not had the backing track jobs migration run, apply that section of supabase-schema.sql.');
        }
    };

    const handleClearStems = async () => {
        if (window.confirm('Are you sure you want to remove all stems? This will delete the files permanently.')) {
            setIsUploading(true);
            try {
                // Delete files from storage
                const pathsToDelete = stems.map(s => s.storagePath).filter(Boolean);
                if (pathsToDelete.length > 0) {
                    const { error } = await supabase.storage
                        .from('stems')
                        .remove(pathsToDelete);

                    if (error) console.error('Error deleting files from storage:', error);
                }

                setStems([]);
                if (textId) {
                    await updateText(textId, { stems: [] });

                    // Refresh parent data to ensure sync
                    if (onStemsUpdate) {
                        await onStemsUpdate();
                    }
                }
            } catch (error) {
                console.error('Error clearing stems:', error);
            } finally {
                setIsUploading(false);
            }
        }
    };

    const isRunningFetch = job?.status === 'queued' || job?.status === 'running';

    const getRandomColor = () => {
        const colors = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f43f5e'];
        return colors[Math.floor(Math.random() * colors.length)];
    };

    return (
        <Box
            style={{
                display: isVisible ? 'block' : 'none',
                flexShrink: 0,
                borderTop: '1px solid var(--gray-a5)',
                background: 'var(--color-panel-solid)',
                maxHeight: '38vh',
                overflowY: 'auto'
            }}
        >
            {job && job.status !== 'done' && (
                <Box px="4" pt="3">
                    <Flex align="center" gap="2">
                        <Badge color={job.status === 'error' ? 'red' : 'blue'} variant="soft">
                            {job.status === 'error' ? 'Fetch failed' : 'Fetching from YouTube'}
                        </Badge>
                        <Text size="1" color="gray">
                            {job.status === 'error' ? job.message : job.stage}
                        </Text>
                    </Flex>
                    {job.status === 'queued' && (
                        <Text as="div" size="1" color="gray" mt="1">
                            Waiting for the fetcher on your machine. Start it with npm run fetch-songs.
                        </Text>
                    )}
                </Box>
            )}

            {/* The mixer is what gets used; the tools that fill it fold away */}
            <Flex align="center" justify="between" px={{ initial: '3', sm: '4' }} pt="2" pb="1" gap="3">
                <Text size="1" weight="bold" color="gray" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Mix
                </Text>
                <Button size="1" variant={areToolsOpen ? 'solid' : 'soft'} onClick={() => setAreToolsOpen(!areToolsOpen)}>
                    {areToolsOpen ? 'Done' : 'Add or split'}
                </Button>
            </Flex>

            <Box px={{ initial: '3', sm: '4' }} pb="2">
                {stems.length === 0 && !isUploading && (
                    <Text as="div" size="1" color="gray">
                        No tracks yet. Add an audio file, split one, or fetch a link.
                    </Text>
                )}

                <Flex direction="column" gap="1">
                    {inMixOrder(stems).map(({ stem, index }) => {
                        const level = levelFor(stem);
                        const pan = level.pan ?? 0;
                        return (
                            <Flex key={stem.src} align="center" gap="2">
                                <IconButton
                                    size="1"
                                    variant={level.muted ? 'solid' : 'soft'}
                                    color={level.muted ? 'red' : 'gray'}
                                    onClick={() => setLevel(index, stem, { ...level, muted: !level.muted })}
                                    title={level.muted ? 'Unmute' : 'Mute'}
                                >
                                    {level.muted ? 'M' : '♪'}
                                </IconButton>
                                <Text
                                    size="1"
                                    title={stem.label}
                                    style={{
                                        width: 116, flexShrink: 0, color: roleFor(stem).color, fontWeight: 600,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                    }}
                                >
                                    {displayName(stem, index)}
                                </Text>
                                <Flex gap="1" flexShrink="0">
                                    {PAN_POSITIONS.map(position => (
                                        <IconButton
                                            key={position.value}
                                            size="1"
                                            variant={pan === position.value ? 'solid' : 'soft'}
                                            color={pan === position.value ? 'blue' : 'gray'}
                                            onClick={() => setLevel(index, stem, { ...level, pan: position.value })}
                                            title={position.title}
                                        >
                                            <Text size="1">{position.label}</Text>
                                        </IconButton>
                                    ))}
                                </Flex>
                                <Box style={{ flex: 1, minWidth: 80, maxWidth: 260 }}>
                                    <Slider
                                        size="1"
                                        value={[Math.round(level.volume * 100)]}
                                        onValueChange={([value]) => setLevel(index, stem, { ...level, volume: value / 100 })}
                                        min={0}
                                        max={100}
                                    />
                                </Box>
                            </Flex>
                        );
                    })}
                </Flex>
            </Box>

            {areToolsOpen && (
                <Flex direction={{ initial: 'column', sm: 'row' }} gap="4" px={{ initial: '3', sm: '4' }} pb="3" align="start"
                      style={{ borderTop: '1px solid var(--gray-a4)', paddingTop: 'var(--space-3)' }}>
                {/* Add existing stems */}
                <Flex direction="column" gap="2" style={{ minWidth: 200 }}>
                    <Text size="1" weight="bold" color="gray" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Add tracks
                    </Text>
                    <Text size="1" color="gray">Audio files you already have.</Text>
                    <Flex gap="2" align="center">
                        <Button size="2" variant="soft" disabled={isUploading} asChild>
                            <label style={{ cursor: 'pointer' }}>
                                {isUploading ? 'Uploading…' : 'Choose files'}
                                <input
                                    type="file"
                                    multiple
                                    accept="audio/*"
                                    onChange={handleFileUpload}
                                    disabled={isUploading}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        </Button>
                        {stems.length > 0 && (
                            <Button size="2" variant="ghost" color="red" onClick={handleClearStems} disabled={isUploading}>
                                Remove all
                            </Button>
                        )}
                    </Flex>
                </Flex>

                {/* Split a song into stems, by either route */}
                <Flex direction="column" gap="3" style={{ minWidth: 280 }}>
                    <Box>
                        <Text size="1" weight="bold" color="gray" style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Split a song
                        </Text>
                        <Text as="div" size="1" color="gray">Separates the vocal from the backing.</Text>
                    </Box>

                    {/* A file you have, split in the cloud */}
                    <Box>
                        <Flex align="center" gap="2" mb="1">
                            <Text size="1" weight="medium">From a file</Text>
                            <Badge color={minutesLeft === null ? 'gray' : 'blue'} variant="soft" radius="full">
                                {minutesLeft === null ? 'LALAL.AI not set up' : `LALAL.AI · ${Math.round(minutesLeft)} min left`}
                            </Badge>
                        </Flex>
                        <Button size="2" variant="soft" disabled={!!splitProgress || isUploading} asChild>
                            <label style={{ cursor: 'pointer' }}>
                                {splitProgress ? 'Splitting…' : 'Choose a song'}
                                <input
                                    type="file"
                                    accept="audio/*"
                                    onChange={handleSplitUpload}
                                    disabled={!!splitProgress || isUploading}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        </Button>

                        {splitProgress && (
                            <Box mt="1">
                                <Progress value={splitProgress.percent} size="1" />
                                <Text as="div" size="1" color="gray" mt="1">{splitProgress.message}</Text>
                            </Box>
                        )}
                        {splitError && (
                            <Text as="div" size="1" color="red" mt="1">{splitError}</Text>
                        )}
                    </Box>

                    {/* A link, fetched and split by StemDeck at home */}
                    <Box>
                        <Flex align="center" gap="2" mb="1">
                            <Text size="1" weight="medium">From a link</Text>
                            <Badge color="gray" variant="soft" radius="full">StemDeck · your machine</Badge>
                        </Flex>
                        <Flex gap="2">
                            <TextField.Root
                                size="2"
                                placeholder="YouTube link"
                                value={link}
                                onChange={(event) => setLinkDraft(event.target.value)}
                                style={{ flex: 1, minWidth: 0 }}
                            />
                            <Button
                                size="2"
                                variant="soft"
                                onClick={handleQueueFetch}
                                disabled={!link.trim() || isRunningFetch}
                            >
                                {isRunningFetch ? 'Fetching…' : 'Fetch'}
                            </Button>
                        </Flex>
                        {fetchError && (
                            <Text as="div" size="1" color="red" mt="1">{fetchError}</Text>
                        )}
                    </Box>
                </Flex>
                </Flex>
            )}
        </Box>
    );
};

export default StemPlayerWrapper;
