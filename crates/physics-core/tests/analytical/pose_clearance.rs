use physics_core::geometry::{ClearanceShape, Point2, signed_shape_separation};

const TOLERANCE: f32 = 1.0e-6;

fn assert_separation(actual: f32, expected: f32) {
    assert!(
        (actual - expected).abs() <= TOLERANCE,
        "expected {expected:.6} m, got {actual:.6} m"
    );
}

#[test]
fn capsule_circle_signed_separation_tracks_touch_and_penetration() {
    let capsule = ClearanceShape::Capsule {
        start: Point2::new(-1.0, 0.0),
        end: Point2::new(1.0, 0.0),
        radius: 0.1,
    };

    for (center_y, expected) in [(0.3, 0.0), (0.299, -0.001), (0.25, -0.05)] {
        let circle = ClearanceShape::Circle {
            center: Point2::new(0.0, center_y),
            radius: 0.2,
        };
        assert_separation(signed_shape_separation(&capsule, &circle), expected);
        assert_separation(signed_shape_separation(&circle, &capsule), expected);
    }
}

#[test]
fn capsule_capsule_signed_separation_tracks_touch_and_penetration() {
    let horizontal = ClearanceShape::Capsule {
        start: Point2::new(-1.0, 0.0),
        end: Point2::new(1.0, 0.0),
        radius: 0.1,
    };

    for (height, expected) in [(0.3, 0.0), (0.299, -0.001), (0.25, -0.05)] {
        let parallel = ClearanceShape::Capsule {
            start: Point2::new(-1.0, height),
            end: Point2::new(1.0, height),
            radius: 0.2,
        };
        assert_separation(signed_shape_separation(&horizontal, &parallel), expected);
    }
}

#[test]
fn circle_ring_signed_separation_uses_the_finite_annulus() {
    let ring = ClearanceShape::Ring {
        center: Point2::new(0.0, 0.0),
        inner_radius: 0.8,
        outer_radius: 1.0,
    };

    for (center_x, expected) in [(1.2, 0.0), (1.199, -0.001), (1.15, -0.05)] {
        let circle = ClearanceShape::Circle {
            center: Point2::new(center_x, 0.0),
            radius: 0.2,
        };
        assert_separation(signed_shape_separation(&circle, &ring), expected);
        assert_separation(signed_shape_separation(&ring, &circle), expected);
    }
}
