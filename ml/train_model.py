import pandas as pd
import numpy as np

from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    brier_score_loss,
    roc_auc_score
)
from sklearn.model_selection import GroupKFold


# --------------------------------------------------
# 1. Load prepared dataset
# --------------------------------------------------

df = pd.read_csv("data/prepared_flood_data.csv")

print("=" * 70)
print("RESQROUTE — PROBABILITY CALIBRATION ANALYSIS")
print("=" * 70)

print(f"Total records: {len(df)}")
print(f"Unique gauges: {df['GaugeID'].nunique()}")


# --------------------------------------------------
# 2. Define all 34 features
# --------------------------------------------------

rainfall_features = [
    "T1d",
    "T2d",
    "T3d",
    "T4d",
    "T5d",
    "T6d",
    "T7d",
    "T8d",
    "T9d",
    "T10d"
]


physical_features = [
    "Stream Order",
    "Drainage Area",
    "Catchment Relief",
    "Catchment Length",
    "Catchment Perimeter",
    "Sinuosity Index",
    "Form Factor",
    "Relief Ratio",
    "Elongation Ratio",
    "Circularity Ratio",
    "Drainage Density",
    "Basin Magnitude",
    "Channel Frequency",
    "Drainage Intensity",
    "Infiltration Number",
    "Ruggedness Number",
    "Annual Mean Temperature",
    "Annual Precipitation",
    "Precipitation of Wettest Month",
    "Precipitation Seasonality"
]


vulnerability_features = [
    "Road Density",
    "Urban percentage",
    "Population Count",
    "Population Density"
]


all_features = (
    rainfall_features
    + physical_features
    + vulnerability_features
)


# --------------------------------------------------
# 3. Prepare data
# --------------------------------------------------

X = df[all_features]

y = df["Target"]

groups = df["GaugeID"]


print(f"Number of features: {len(all_features)}")
print("Validation strategy: 5-fold GroupKFold")
print("Grouping variable: GaugeID")


# --------------------------------------------------
# 4. Five-fold cross-validation
# --------------------------------------------------

group_kfold = GroupKFold(
    n_splits=5
)


all_actual = []

all_probabilities = []


for fold, (train_indices, test_indices) in enumerate(
    group_kfold.split(
        X,
        y,
        groups=groups
    ),
    start=1
):

    print("\n" + "=" * 70)
    print(f"FOLD {fold}")
    print("=" * 70)

    X_train = X.iloc[train_indices]
    X_test = X.iloc[test_indices]

    y_train = y.iloc[train_indices]
    y_test = y.iloc[test_indices]

    print(f"Training records: {len(train_indices)}")
    print(f"Testing records:  {len(test_indices)}")

    print(
        f"Training gauges:  "
        f"{groups.iloc[train_indices].nunique()}"
    )

    print(
        f"Testing gauges:   "
        f"{groups.iloc[test_indices].nunique()}"
    )

    # --------------------------------------------------
    # Train Random Forest
    # --------------------------------------------------

    print("\nTraining Random Forest...")

    model = RandomForestClassifier(
        n_estimators=300,
        max_depth=None,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        class_weight="balanced",
        n_jobs=-1
    )

    model.fit(
        X_train,
        y_train
    )

    print("Training complete!")

    # --------------------------------------------------
    # Probability predictions
    # --------------------------------------------------

    probabilities = model.predict_proba(
        X_test
    )[:, 1]

    all_actual.extend(
        y_test.tolist()
    )

    all_probabilities.extend(
        probabilities.tolist()
    )

    fold_auc = roc_auc_score(
        y_test,
        probabilities
    )

    print(
        f"Fold ROC-AUC: {fold_auc:.4f}"
    )


# --------------------------------------------------
# 5. Convert predictions to arrays
# --------------------------------------------------

all_actual = np.array(
    all_actual
)

all_probabilities = np.array(
    all_probabilities
)


# --------------------------------------------------
# 6. Overall ROC-AUC
# --------------------------------------------------

overall_auc = roc_auc_score(
    all_actual,
    all_probabilities
)


# --------------------------------------------------
# 7. Brier score
# --------------------------------------------------

brier_score = brier_score_loss(
    all_actual,
    all_probabilities
)


print("\n" + "=" * 70)
print("OVERALL PROBABILITY QUALITY")
print("=" * 70)

print(
    f"ROC-AUC:      {overall_auc:.4f}"
)

print(
    f"Brier Score:  {brier_score:.4f}"
)


# --------------------------------------------------
# 8. Calculate calibration curve
# --------------------------------------------------

prob_true, prob_pred = calibration_curve(
    all_actual,
    all_probabilities,
    n_bins=10,
    strategy="uniform"
)


calibration_results = pd.DataFrame({
    "Mean Predicted Probability": prob_pred,
    "Actual Severe Flood Rate": prob_true
})


# --------------------------------------------------
# 9. Display calibration results
# --------------------------------------------------

print("\n" + "=" * 70)
print("CALIBRATION CURVE")
print("=" * 70)

print(
    calibration_results.to_string(
        index=False,
        float_format=lambda x: f"{x:.4f}"
    )
)


# --------------------------------------------------
# 10. Compare predicted probability ranges
# --------------------------------------------------

probability_ranges = [
    (0.0, 0.1),
    (0.1, 0.2),
    (0.2, 0.3),
    (0.3, 0.4),
    (0.4, 0.5),
    (0.5, 0.6),
    (0.6, 0.7),
    (0.7, 0.8),
    (0.8, 0.9),
    (0.9, 1.0)
]


range_results = []


for lower, upper in probability_ranges:

    if upper == 1.0:
        mask = (
            (all_probabilities >= lower)
            & (all_probabilities <= upper)
        )
    else:
        mask = (
            (all_probabilities >= lower)
            & (all_probabilities < upper)
        )

    count = mask.sum()

    if count > 0:

        actual_rate = all_actual[mask].mean()

        predicted_mean = all_probabilities[mask].mean()

        range_results.append({
            "Probability Range": f"{lower:.1f}-{upper:.1f}",
            "Samples": count,
            "Mean Predicted": predicted_mean,
            "Actual Severe Rate": actual_rate
        })


range_df = pd.DataFrame(
    range_results
)


# --------------------------------------------------
# 11. Display probability ranges
# --------------------------------------------------

print("\n" + "=" * 70)
print("PREDICTED PROBABILITY VS ACTUAL OUTCOME")
print("=" * 70)

print(
    range_df.to_string(
        index=False,
        float_format=lambda x: f"{x:.4f}"
    )
)


# --------------------------------------------------
# 12. Save calibration results
# --------------------------------------------------

calibration_results.to_csv(
    "data/calibration_curve.csv",
    index=False
)


range_df.to_csv(
    "data/probability_calibration.csv",
    index=False
)


print("\nSaved:")
print("data/calibration_curve.csv")
print("data/probability_calibration.csv")

print("=" * 70)