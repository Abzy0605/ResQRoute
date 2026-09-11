import os
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
import joblib


# --------------------------------------------------
# 1. Load prepared dataset
# --------------------------------------------------

df = pd.read_csv(
    "data/prepared_flood_data.csv"
)

print("=" * 70)
print("RESQROUTE — FINAL FLOOD SEVERITY MODEL")
print("=" * 70)

print(
    f"Total records: {len(df)}"
)

print(
    f"Unique gauges: {df['GaugeID'].nunique()}"
)


# --------------------------------------------------
# 2. Define final feature groups
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


final_features = (
    rainfall_features
    + physical_features
    + vulnerability_features
)


# --------------------------------------------------
# 3. Prepare training data
# --------------------------------------------------

X = df[final_features]

y = df["Target"]


print("\nFinal feature configuration:")
print(
    f"Rainfall features:      {len(rainfall_features)}"
)

print(
    f"Physical features:      {len(physical_features)}"
)

print(
    f"Vulnerability features: {len(vulnerability_features)}"
)

print(
    f"Total features:          {len(final_features)}"
)


# --------------------------------------------------
# 4. Display target distribution
# --------------------------------------------------

print("\nTarget distribution:")

print(
    df["Flood Type"].value_counts()
)


# --------------------------------------------------
# 5. Create final Random Forest
# --------------------------------------------------

print("\nCreating final Random Forest...")


model = RandomForestClassifier(
    n_estimators=300,
    max_depth=None,
    min_samples_split=5,
    min_samples_leaf=2,
    random_state=42,
    class_weight="balanced",
    n_jobs=-1
)


# --------------------------------------------------
# 6. Train on all available data
# --------------------------------------------------

print("Training on all available records...")

model.fit(
    X,
    y
)

print("Training complete!")


# --------------------------------------------------
# 7. Create models directory
# --------------------------------------------------

os.makedirs(
    "models",
    exist_ok=True
)


# --------------------------------------------------
# 8. Save trained model
# --------------------------------------------------

model_path = (
    "models/flood_severity_model.joblib"
)

joblib.dump(
    model,
    model_path
)


# --------------------------------------------------
# 9. Save feature configuration
# --------------------------------------------------

feature_config = {
    "rainfall_features": rainfall_features,
    "physical_features": physical_features,
    "vulnerability_features": vulnerability_features,
    "all_features": final_features,
    "threshold": 0.40
}


config_path = (
    "models/feature_config.joblib"
)

joblib.dump(
    feature_config,
    config_path
)


# --------------------------------------------------
# 10. Display feature importance
# --------------------------------------------------

importance = pd.DataFrame({
    "Feature": final_features,
    "Importance": model.feature_importances_
})


importance = importance.sort_values(
    by="Importance",
    ascending=False
)


print("\nTop 15 Features:")

print(
    importance
    .head(15)
    .to_string(index=False)
)


# --------------------------------------------------
# 11. Test the saved model
# --------------------------------------------------

print("\nTesting saved model...")

loaded_model = joblib.load(
    model_path
)


sample_predictions = loaded_model.predict_proba(
    X.head(5)
)[:, 1]


print(
    "\nSample Severe Flood scores:"
)

for i, score in enumerate(
    sample_predictions,
    start=1
):

    print(
        f"Record {i}: {score:.4f}"
    )


# --------------------------------------------------
# 12. Final information
# --------------------------------------------------

print("\n" + "=" * 70)
print("FINAL MODEL CREATED")
print("=" * 70)

print(
    f"Model saved to:  {model_path}"
)

print(
    f"Config saved to:  {config_path}"
)

print(
    f"Features:          {len(final_features)}"
)

print(
    f"Decision threshold: 0.40"
)

print(
    "Training records:   "
    f"{len(df)}"
)

print("=" * 70)