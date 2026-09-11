import pandas as pd


# --------------------------------------------------
# 1. Load datasets
# --------------------------------------------------

events = pd.read_csv("data/floodevents_indofloods.csv")

rainfall = pd.read_csv(
    "data/precipitation_variables_indofloods.csv"
)

catchment = pd.read_csv(
    "data/catchment_characteristics_indofloods.csv"
)


# --------------------------------------------------
# 2. Create GaugeID from EventID
# --------------------------------------------------

events["GaugeID"] = (
    events["EventID"]
    .str.rsplit("-", n=1)
    .str[0]
)


# --------------------------------------------------
# 3. Select rainfall features
# --------------------------------------------------

rainfall_features = [
    "EventID",
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

rainfall_selected = rainfall[rainfall_features]


# --------------------------------------------------
# 4. Select catchment features
# --------------------------------------------------

catchment_features = [
    "GaugeID",
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
    "Precipitation Seasonality",
    "Road Density",
    "Urban percentage",
    "Population Count",
    "Population Density"
]

catchment_selected = catchment[catchment_features]


# --------------------------------------------------
# 5. Merge flood events with rainfall
# --------------------------------------------------

combined = events.merge(
    rainfall_selected,
    on="EventID",
    how="inner"
)


# --------------------------------------------------
# 6. Merge with catchment characteristics
# --------------------------------------------------

combined = combined.merge(
    catchment_selected,
    on="GaugeID",
    how="inner"
)


# --------------------------------------------------
# 7. Convert target to numeric
# --------------------------------------------------

combined["Target"] = (
    combined["Flood Type"]
    .map({
        "Flood": 0,
        "Severe Flood": 1
    })
)


# --------------------------------------------------
# 8. Verify the result
# --------------------------------------------------

print("=" * 60)
print("DATASET PREPARATION")
print("=" * 60)

print(f"Flood events loaded: {len(events)}")
print(f"Rainfall records loaded: {len(rainfall)}")
print(f"Catchment records loaded: {len(catchment)}")

print(f"\nCombined dataset shape: {combined.shape}")

print("\nTarget distribution:")
print(combined["Flood Type"].value_counts())

print("\nTarget numeric distribution:")
print(combined["Target"].value_counts())

print("\nMissing values in selected features:")

selected_columns = rainfall_features[1:] + catchment_features[1:]

print(
    combined[selected_columns]
    .isna()
    .sum()
    .sort_values(ascending=False)
    .to_string()
)


# --------------------------------------------------
# 9. Save prepared dataset
# --------------------------------------------------

output_columns = (
    ["EventID", "GaugeID"]
    + rainfall_features[1:]
    + catchment_features[1:]
    + ["Flood Type", "Target"]
)

combined[output_columns].to_csv(
    "data/prepared_flood_data.csv",
    index=False
)


print("\nPrepared dataset saved to:")
print("data/prepared_flood_data.csv")

print("\nFirst 5 rows:")
print(
    combined[output_columns]
    .head()
    .to_string()
)

print("=" * 60)