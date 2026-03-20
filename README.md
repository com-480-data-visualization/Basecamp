# Project of Data Visualization (COM-480)

| Student's name | SCIPER |
| -------------- | ------ |
| Vsevolod Malevannyi | 389556 |
| Shahrzad Javidi | 388196 |
| Maksim Vasilev | 389725 |

[Milestone 1](#milestone-1) • [Milestone 2](#milestone-2) • [Milestone 3](#milestone-3)

## Milestone 1 (20th March, 5pm)

**10% of the final grade**

This is a preliminary milestone to let you set up goals for your final project and assess the feasibility of your ideas.
Please, fill the following sections about your project.

*(max. 2000 characters per section)*

### Dataset

We use the **Himalayan Database**, a record of all expeditions to Nepal's Himalayan peaks from 1905 to 2019. The data comes from the [TidyTuesday 2020](https://github.com/rfordatascience/tidytuesday/tree/main/data/2020/2020-09-22) cleaned version of the original [Himalayan Database](https://www.himalayandatabase.com/) compiled by Elizabeth Hawley.

It consists of three CSV files:
- **peaks.csv** (468 rows): peak name, height, climbing status, first ascent year/country
- **expeditions.csv** (10,364 rows): expedition details including year, season, highpoint, termination reason, team size, oxygen usage, trekking agency
- **members.csv** (76,519 rows): individual climber data including age, sex, nationality, role, success, death/injury details

The data is already clean and well-structured. Missing values are limited: age is missing for 4.6% of members, citizenship for only 10%. Date fields are strings that need parsing. The `trekking_agency` field has many null values in early decades (before commercial mountaineering existed), so this is expected, not a data quality issue.

No major preprocessing is needed beyond date conversion and optional merging of the three tables. The dataset is also available on [Kaggle](https://www.kaggle.com/datasets/majunbajun/himalayan-climbing-expeditions).

### Problematic

Our visualization will tell the story of how Himalayan climbing turned from rare expeditions into a commercial business, and what that transformation costs in human lives.

Mountaineering in Nepal has changed a lot over the past century. In the 1950s, reaching the summit of Everest was a national achievement. Today, hundreds of people summit each spring season, guided by commercial agencies. The visualization will cover four angles:

1. **Commercialization**: from rare government-backed expeditions to 98%+ agency-organized trips. Team sizes, hired staff numbers, and expedition frequency all exploded since the 1990s.
2. **Human cost**: 1,106 people have died. The per-person death rate dropped, but absolute deaths remain steady because volume keeps growing. We will break this down by peak, altitude, cause, and decade.
3. **Sherpa risk**: hired staff die at 2.0% vs 1.3% for paying members. The visualization will ask who bears the cost of commercial mountaineering.
4. **Oxygen**: users summit at 78% vs 26% without it.

Most coverage of Himalayan climbing focuses on Everest summit stories or disasters. The long-term trends, how commercialization changed safety and access, get less attention. Our visualization will focus on those trends and on the question of who takes the biggest risks.

Our target audience is people interested in mountaineering or who have seen news about Everest overcrowding. The visualizations will be simple and readable without technical background, but will still show the patterns in the data.

### Exploratory Data Analysis

Our full EDA is in [`notebooks/eda.ipynb`](notebooks/eda.ipynb). Key findings:

**Scale**: 468 peaks, 10,364 expeditions, 76,519 individual member records spanning 1905-2019, with climbers from 212 countries.

**Growth**: Expeditions grew from single digits per year before the 1950s to 400+ per year by 2019. Autumn has more expeditions (5,064) than Spring (4,875), but Spring expeditions are larger (Everest is primarily a spring climb).

**Success**: Overall summit rate is 38.2%. It rose from under 20% in early decades to over 50% in recent years, as gear, oxygen use, and commercial support improved.

**Deaths**: 1,106 total deaths (1.45% overall rate). The rate has declined over time, but the total number of deaths stays roughly the same. Top causes: avalanche (369), falls (331), altitude sickness (102). Everest alone accounts for 306 deaths.

**Demographics**: 90.8% male. Nepal is the top nationality (16,135 members, mostly hired staff), followed by USA (6,448), Japan (6,432), UK (5,219), France (4,611). Mean age is 35.

**Oxygen**: Members who used supplemental oxygen summited at 78% vs 26% for those without, and died less often. Usage grew over time, most on 8000m peaks.

**Commercialization**: Trekking agency usage rose from near-zero before 1970 to 98.4% of expeditions since 2010. Hired staff now make up a growing share of expedition members.

### Related work

Several projects have used the Himalayan Database:

- The [TidyTuesday community](https://github.com/rfordatascience/tidytuesday/tree/main/data/2020/2020-09-22) produced many static analyses in R when this dataset was featured in September 2020. Most focus on single charts (e.g., death rates by peak, success over time) rather than an interactive visualization.
- Alex Cookson's [blog post](https://www.alexcookson.com/post/analyzing-himalayan-peaks-first-ascents/) analyzed first ascents and peak difficulty. His cleaned version of the data is what we use.
- The [Himalayan Database website](https://www.himalayandatabase.com/) itself offers a searchable interface but no visual storytelling.

**What makes our approach original**: existing analyses present individual charts without a connecting thread. We plan to build a narrative that will show how climbing changed, from exploration to industry. The structure will follow a timeline arc, with some interactive elements that will let users explore the data at their own pace.

**Inspirations**: 

- [Johnny Harris](https://www.youtube.com/watch?v=OMbV1rIPhCg&t=268s&pp=ygULc3dpc3MgdHJhaW4%3D) and his recent work on filming and visualizing Swiss train system, and his map-based visual storytelling. 
- [The Pudding](https://pudding.cool/) and their blogposts with data driven narrative.

None of us have used this dataset in our previous courses.

## Milestone 2 (17th April, 5pm)

**10% of the final grade**


## Milestone 3 (29th May, 5pm)

**80% of the final grade**


## Late policy

- < 24h: 80% of the grade for the milestone
- < 48h: 70% of the grade for the milestone
