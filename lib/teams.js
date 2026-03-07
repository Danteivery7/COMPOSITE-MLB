/**
 * All 30 MLB teams with metadata, colors, and ESPN IDs
 */

export const MLB_TEAMS = [
    // AL East
    { id: 'nyy', name: 'Yankees', fullName: 'New York Yankees', city: 'New York', abbr: 'NYY', league: 'AL', division: 'East', espnId: 10, color: '#003087', colorAlt: '#E4002C' },
    { id: 'bos', name: 'Red Sox', fullName: 'Boston Red Sox', city: 'Boston', abbr: 'BOS', league: 'AL', division: 'East', espnId: 2, color: '#BD3039', colorAlt: '#0C2340' },
    { id: 'tb', name: 'Rays', fullName: 'Tampa Bay Rays', city: 'Tampa Bay', abbr: 'TB', league: 'AL', division: 'East', espnId: 30, color: '#092C5C', colorAlt: '#8FBCE6' },
    { id: 'tor', name: 'Blue Jays', fullName: 'Toronto Blue Jays', city: 'Toronto', abbr: 'TOR', league: 'AL', division: 'East', espnId: 14, color: '#134A8E', colorAlt: '#1D2D5C' },
    { id: 'bal', name: 'Orioles', fullName: 'Baltimore Orioles', city: 'Baltimore', abbr: 'BAL', league: 'AL', division: 'East', espnId: 1, color: '#DF4601', colorAlt: '#27251F' },

    // AL Central
    { id: 'cle', name: 'Guardians', fullName: 'Cleveland Guardians', city: 'Cleveland', abbr: 'CLE', league: 'AL', division: 'Central', espnId: 5, color: '#00385D', colorAlt: '#E31937' },
    { id: 'det', name: 'Tigers', fullName: 'Detroit Tigers', city: 'Detroit', abbr: 'DET', league: 'AL', division: 'Central', espnId: 6, color: '#0C2340', colorAlt: '#FA4616' },
    { id: 'kc', name: 'Royals', fullName: 'Kansas City Royals', city: 'Kansas City', abbr: 'KC', league: 'AL', division: 'Central', espnId: 7, color: '#004687', colorAlt: '#BD9B60' },
    { id: 'min', name: 'Twins', fullName: 'Minnesota Twins', city: 'Minnesota', abbr: 'MIN', league: 'AL', division: 'Central', espnId: 9, color: '#002B5C', colorAlt: '#D31145' },
    { id: 'cws', name: 'White Sox', fullName: 'Chicago White Sox', city: 'Chicago', abbr: 'CWS', logoAbbr: 'CHW', league: 'AL', division: 'Central', espnId: 4, color: '#27251F', colorAlt: '#C4CED4' },

    // AL West
    { id: 'hou', name: 'Astros', fullName: 'Houston Astros', city: 'Houston', abbr: 'HOU', league: 'AL', division: 'West', espnId: 18, color: '#002D62', colorAlt: '#EB6E1F' },
    { id: 'sea', name: 'Mariners', fullName: 'Seattle Mariners', city: 'Seattle', abbr: 'SEA', league: 'AL', division: 'West', espnId: 12, color: '#0C2C56', colorAlt: '#005C5C' },
    { id: 'tex', name: 'Rangers', fullName: 'Texas Rangers', city: 'Texas', abbr: 'TEX', league: 'AL', division: 'West', espnId: 13, color: '#003278', colorAlt: '#C0111F' },
    { id: 'laa', name: 'Angels', fullName: 'Los Angeles Angels', city: 'Los Angeles', abbr: 'LAA', league: 'AL', division: 'West', espnId: 3, color: '#BA0021', colorAlt: '#003263' },
    { id: 'oak', name: 'Athletics', fullName: 'Oakland Athletics', city: 'Oakland', abbr: 'OAK', league: 'AL', division: 'West', espnId: 11, color: '#003831', colorAlt: '#EFB21E' },

    // NL East
    { id: 'atl', name: 'Braves', fullName: 'Atlanta Braves', city: 'Atlanta', abbr: 'ATL', league: 'NL', division: 'East', espnId: 15, color: '#CE1141', colorAlt: '#13274F' },
    { id: 'nym', name: 'Mets', fullName: 'New York Mets', city: 'New York', abbr: 'NYM', league: 'NL', division: 'East', espnId: 21, color: '#002D72', colorAlt: '#FF5910' },
    { id: 'phi', name: 'Phillies', fullName: 'Philadelphia Phillies', city: 'Philadelphia', abbr: 'PHI', league: 'NL', division: 'East', espnId: 22, color: '#E81828', colorAlt: '#002D72' },
    { id: 'mia', name: 'Marlins', fullName: 'Miami Marlins', city: 'Miami', abbr: 'MIA', league: 'NL', division: 'East', espnId: 28, color: '#00A3E0', colorAlt: '#EF3340' },
    { id: 'wsh', name: 'Nationals', fullName: 'Washington Nationals', city: 'Washington', abbr: 'WSH', league: 'NL', division: 'East', espnId: 20, color: '#AB0003', colorAlt: '#14225A' },

    // NL Central
    { id: 'mil', name: 'Brewers', fullName: 'Milwaukee Brewers', city: 'Milwaukee', abbr: 'MIL', league: 'NL', division: 'Central', espnId: 8, color: '#FFC52F', colorAlt: '#12284B' },
    { id: 'chc', name: 'Cubs', fullName: 'Chicago Cubs', city: 'Chicago', abbr: 'CHC', league: 'NL', division: 'Central', espnId: 16, color: '#0E3386', colorAlt: '#CC3433' },
    { id: 'stl', name: 'Cardinals', fullName: 'St. Louis Cardinals', city: 'St. Louis', abbr: 'STL', league: 'NL', division: 'Central', espnId: 24, color: '#C41E3A', colorAlt: '#0C2340' },
    { id: 'pit', name: 'Pirates', fullName: 'Pittsburgh Pirates', city: 'Pittsburgh', abbr: 'PIT', league: 'NL', division: 'Central', espnId: 23, color: '#27251F', colorAlt: '#FDB827' },
    { id: 'cin', name: 'Reds', fullName: 'Cincinnati Reds', city: 'Cincinnati', abbr: 'CIN', league: 'NL', division: 'Central', espnId: 17, color: '#C6011F', colorAlt: '#27251F' },

    // NL West
    { id: 'lad', name: 'Dodgers', fullName: 'Los Angeles Dodgers', city: 'Los Angeles', abbr: 'LAD', league: 'NL', division: 'West', espnId: 19, color: '#005A9C', colorAlt: '#EF3E42' },
    { id: 'sd', name: 'Padres', fullName: 'San Diego Padres', city: 'San Diego', abbr: 'SD', league: 'NL', division: 'West', espnId: 25, color: '#2F241D', colorAlt: '#FFC425' },
    { id: 'sf', name: 'Giants', fullName: 'San Francisco Giants', city: 'San Francisco', abbr: 'SF', league: 'NL', division: 'West', espnId: 26, color: '#FD5A1E', colorAlt: '#27251F' },
    { id: 'ari', name: 'Diamondbacks', fullName: 'Arizona Diamondbacks', city: 'Arizona', abbr: 'ARI', league: 'NL', division: 'West', espnId: 29, color: '#A71930', colorAlt: '#E3D4AD' },
    { id: 'col', name: 'Rockies', fullName: 'Colorado Rockies', city: 'Colorado', abbr: 'COL', league: 'NL', division: 'West', espnId: 27, color: '#333366', colorAlt: '#C4CED4' },
];

// Alias for cleaner imports
export const ALL_TEAMS = MLB_TEAMS;

export const DIVISIONS = ['East', 'Central', 'West'];
export const LEAGUES = ['AL', 'NL'];

/**
 * Get a team by its ID
 */
export function getTeamById(id) {
    return MLB_TEAMS.find(t => t.id === id);
}

// Alias
export const getTeam = getTeamById;

/**
 * Get a team by ESPN ID
 */
export function getTeamByEspnId(espnId) {
    return MLB_TEAMS.find(t => t.espnId === espnId) || null;
}

/**
 * Get ESPN logo URL for a team
 */
export function getTeamLogo(espnId, size = 40) {
    return `https://a.espncdn.com/i/teamlogos/mlb/500/${espnId}.png`;
}

/**
 * Get teams filtered by league and/or division
 */
export function getTeamsByFilter(league, division) {
    return MLB_TEAMS.filter(t => {
        if (league && t.league !== league) return false;
        if (division && t.division !== division) return false;
        return true;
    });
}

