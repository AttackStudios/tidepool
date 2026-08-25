using System;
using UnityEngine;

namespace TidePool.SurfMP.Sync;

/// <summary>
/// Another player, in your water.
///
/// Built by cloning the local PlayerCharacter, so a remote rider looks exactly
/// like a rider without needing a model, a prefab, or anything shipped with the
/// mod. The clone's own logic is then switched off: it must be a puppet driven
/// by the wire, not a second surfer trying to surf.
/// </summary>
internal sealed class RemoteSurfer
{
    /// <summary>
    /// Positions arrive about twenty times a second; frames render far more
    /// often. Moving straight to each new position would visibly step, so
    /// converge toward it instead — fast enough to stay honest, smooth enough
    /// to read as a person rather than a teleporting sprite.
    /// </summary>
    private const float Converge = 12f;

    private readonly GameObject _object;
    private readonly Transform _transform;

    private Vector3 _target;
    private Vector3 _velocity;
    private float _heading;

    internal string Name { get; }

    private RemoteSurfer(string name, GameObject clone)
    {
        Name = name;
        _object = clone;
        _transform = clone.transform;
        _target = _transform.position;
    }

    /// <summary>Returns null rather than throwing: a missing surfer is not worth a dead session.</summary>
    internal static RemoteSurfer Spawn(string name, GameObject template)
    {
        try
        {
            if (template == null) return null;

            var clone = UnityEngine.Object.Instantiate(template);
            clone.name = $"SurfMP:{name}";

            Silence(clone);

            Mod.Log.Msg($"[surfer] spawned {name}");
            return new RemoteSurfer(name, clone);
        }
        catch (Exception e)
        {
            Mod.Log.Error($"[surfer] spawning {name}: {e.GetType().Name}: {e.Message}");
            return null;
        }
    }

    /// <summary>
    /// Switch off everything that would make the clone act on its own.
    ///
    /// Its Surf behaviours would otherwise paddle, catch waves and respond to
    /// input — the local player's input, since that is the only input this
    /// process has. Physics goes kinematic for the same reason: the wire owns
    /// this transform, and a rigidbody would fight every update.
    /// </summary>
    private static void Silence(GameObject clone)
    {
        foreach (var behaviour in clone.GetComponentsInChildren<Behaviour>(true))
        {
            try
            {
                var ns = behaviour.GetType().Namespace;
                if (ns != null && ns.StartsWith("Il2CppSurf", StringComparison.Ordinal))
                    behaviour.enabled = false;
            }
            catch (Exception) { /* a component that refuses is not fatal */ }
        }

        foreach (var body in clone.GetComponentsInChildren<Rigidbody>(true))
        {
            try { body.isKinematic = true; }
            catch (Exception) { }
        }

        // Cameras and listeners come along with the clone and would fight the
        // local player's view. There can only be one of each that matters.
        foreach (var camera in clone.GetComponentsInChildren<Camera>(true))
        {
            try { camera.enabled = false; } catch (Exception) { }
        }
        foreach (var listener in clone.GetComponentsInChildren<AudioListener>(true))
        {
            try { listener.enabled = false; } catch (Exception) { }
        }
    }

    internal void Apply(Vector3 position, float heading, Vector3 velocity)
    {
        _target = position;
        _heading = heading;
        _velocity = velocity;
    }

    internal void Tick(float dt)
    {
        if (_transform == null) return;

        // Carry the last known velocity forward between updates. Without it a
        // rider stalls at their last reported point and then jumps, which reads
        // far worse than being slightly wrong about where they are.
        _target += _velocity * dt;

        var t = 1f - Mathf.Exp(-Converge * dt);
        _transform.position = Vector3.Lerp(_transform.position, _target, t);

        var facing = Quaternion.Euler(0f, _heading, 0f);
        _transform.rotation = Quaternion.Slerp(_transform.rotation, facing, t);
    }

    internal void Despawn()
    {
        try { if (_object != null) UnityEngine.Object.Destroy(_object); }
        catch (Exception) { }
    }
}
