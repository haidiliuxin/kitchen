#include <algorithm>
#include <array>
#include <cctype>
#include <iomanip>
#include <iostream>
#include <optional>
#include <random>
#include <sstream>
#include <string>
#include <vector>

namespace {

constexpr int kRows = 5;
constexpr int kCols = 9;
constexpr int kGoalTurns = 20;
constexpr int kStartingSun = 150;
constexpr int kSkySunAmount = 25;
constexpr int kSkySunInterval = 3;
constexpr int kSunflowerAmount = 25;
constexpr int kSunflowerInterval = 2;
constexpr int kEventLimit = 10;

enum class PlantType {
    None,
    Sunflower,
    Peashooter,
    WallNut,
    IcePea,
    CherryBomb,
};

enum class ZombieType {
    Basic,
    Conehead,
    Buckethead,
    Runner,
};

struct Plant {
    PlantType type = PlantType::None;
    int hp = 0;
    int timer = 0;
};

struct Zombie {
    int id = 0;
    ZombieType type = ZombieType::Basic;
    int row = 0;
    int col = kCols - 1;
    int hp = 0;
    int damage = 0;
    int moveInterval = 1;
    int moveProgress = 0;
    int slowTurns = 0;
};

std::string toLower(std::string value) {
    for (char& ch : value) {
        ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
    }
    return value;
}

const char* plantName(PlantType type) {
    switch (type) {
        case PlantType::Sunflower:
            return "Sunflower";
        case PlantType::Peashooter:
            return "Peashooter";
        case PlantType::WallNut:
            return "Wall-nut";
        case PlantType::IcePea:
            return "Ice Pea";
        case PlantType::CherryBomb:
            return "Cherry Bomb";
        case PlantType::None:
        default:
            return "Empty";
    }
}

const char* zombieName(ZombieType type) {
    switch (type) {
        case ZombieType::Basic:
            return "Basic zombie";
        case ZombieType::Conehead:
            return "Conehead zombie";
        case ZombieType::Buckethead:
            return "Buckethead zombie";
        case ZombieType::Runner:
            return "Runner zombie";
        default:
            return "Zombie";
    }
}

char plantSymbol(PlantType type) {
    switch (type) {
        case PlantType::Sunflower:
            return 'S';
        case PlantType::Peashooter:
            return 'P';
        case PlantType::WallNut:
            return 'W';
        case PlantType::IcePea:
            return 'I';
        case PlantType::CherryBomb:
            return 'C';
        case PlantType::None:
        default:
            return '.';
    }
}

char zombieSymbol(ZombieType type) {
    switch (type) {
        case ZombieType::Basic:
            return 'z';
        case ZombieType::Conehead:
            return 'c';
        case ZombieType::Buckethead:
            return 'b';
        case ZombieType::Runner:
            return 'r';
        default:
            return 'z';
    }
}

int plantCost(PlantType type) {
    switch (type) {
        case PlantType::Sunflower:
            return 50;
        case PlantType::Peashooter:
            return 100;
        case PlantType::WallNut:
            return 75;
        case PlantType::IcePea:
            return 125;
        case PlantType::CherryBomb:
            return 125;
        case PlantType::None:
        default:
            return 0;
    }
}

int plantMaxHp(PlantType type) {
    switch (type) {
        case PlantType::Sunflower:
            return 10;
        case PlantType::Peashooter:
            return 12;
        case PlantType::WallNut:
            return 40;
        case PlantType::IcePea:
            return 12;
        case PlantType::CherryBomb:
            return 1;
        case PlantType::None:
        default:
            return 0;
    }
}

std::optional<PlantType> parsePlantType(const std::string& token) {
    const std::string lowered = toLower(token);
    if (lowered == "sunflower" || lowered == "sf") {
        return PlantType::Sunflower;
    }
    if (lowered == "peashooter" || lowered == "pea") {
        return PlantType::Peashooter;
    }
    if (lowered == "wallnut" || lowered == "wall" || lowered == "nut") {
        return PlantType::WallNut;
    }
    if (lowered == "icepea" || lowered == "ice" || lowered == "snow") {
        return PlantType::IcePea;
    }
    if (lowered == "cherrybomb" || lowered == "bomb" || lowered == "cherry") {
        return PlantType::CherryBomb;
    }
    return std::nullopt;
}

class Game {
public:
    Game();
    void run();

private:
    using Board = std::array<std::array<Plant, kCols>, kRows>;

    bool promptUntilAdvance();
    void advanceTurn();
    void resolvePlantPhase();
    void resolveZombiePhase();
    void spawnZombies();
    void sweepDefeatedZombies();
    void attackLaneFromPlant(int row, int col, int damage, int slowTurns);

    void tryPlant(PlantType type, int row, int col);
    void tryRemove(int row, int col);
    void triggerCherryBomb(int row, int col);

    void printState() const;
    void printBoard() const;
    void printShop() const;
    void printHelp() const;
    void printLaneSummary() const;
    void printEvents() const;
    void printGameOver() const;

    bool inBounds(int row, int col) const;
    bool hasPlant(int row, int col) const;
    bool hasZombieAt(int row, int col) const;
    int livingZombieCount() const;
    int plannedSpawnsForTurn() const;
    char zombieMarkerAt(int row, int col) const;
    ZombieType chooseZombieType();
    Zombie makeZombie(ZombieType type, int row);
    void updateWinState();
    void logEvent(const std::string& event);

    Board board_{};
    std::vector<Zombie> zombies_;
    std::vector<std::string> lastEvents_;
    int turn_ = 0;
    int sun_ = kStartingSun;
    int nextZombieId_ = 1;
    bool quit_ = false;
    bool lost_ = false;
    bool won_ = false;
    std::mt19937 rng_;
};

Game::Game() : rng_(std::random_device{}()) {
    lastEvents_.push_back("Defend the house for 20 turns.");
    lastEvents_.push_back("Use 'help' if you want the command list.");
}

void Game::run() {
    std::ios::sync_with_stdio(false);
    std::cin.tie(nullptr);

    while (!quit_ && !lost_ && !won_) {
        printState();
        if (!promptUntilAdvance()) {
            break;
        }
        advanceTurn();
        updateWinState();
    }

    printGameOver();
}

bool Game::promptUntilAdvance() {
    while (true) {
        std::cout << "\nAction> ";

        std::string line;
        if (!std::getline(std::cin, line)) {
            quit_ = true;
            return false;
        }

        std::istringstream iss(line);
        std::string command;
        if (!(iss >> command)) {
            return true;
        }

        command = toLower(command);

        if (command == "next" || command == "n" || command == "skip") {
            return true;
        }

        if (command == "help" || command == "h") {
            printHelp();
            continue;
        }

        if (command == "shop") {
            printShop();
            continue;
        }

        if (command == "status") {
            printLaneSummary();
            continue;
        }

        if (command == "quit" || command == "exit") {
            quit_ = true;
            return false;
        }

        if (command == "plant" || command == "p") {
            std::string typeToken;
            int row = 0;
            int col = 0;
            if (!(iss >> typeToken >> row >> col)) {
                std::cout << "Usage: plant <type> <row> <col>\n";
                continue;
            }

            const std::optional<PlantType> type = parsePlantType(typeToken);
            if (!type.has_value()) {
                std::cout << "Unknown plant type. Type 'help' to see the list.\n";
                continue;
            }

            tryPlant(*type, row - 1, col - 1);
            continue;
        }

        if (command == "remove" || command == "rm" || command == "shovel") {
            int row = 0;
            int col = 0;
            if (!(iss >> row >> col)) {
                std::cout << "Usage: remove <row> <col>\n";
                continue;
            }

            tryRemove(row - 1, col - 1);
            continue;
        }

        std::cout << "Unknown command. Type 'help' for the command list.\n";
    }
}

void Game::advanceTurn() {
    ++turn_;
    lastEvents_.clear();

    if (turn_ % kSkySunInterval == 0) {
        sun_ += kSkySunAmount;
        logEvent("A sun drifted down: +25 sun.");
    }

    resolvePlantPhase();
    sweepDefeatedZombies();
    resolveZombiePhase();
    sweepDefeatedZombies();

    if (!lost_) {
        spawnZombies();
    }
}

void Game::resolvePlantPhase() {
    for (int row = 0; row < kRows; ++row) {
        for (int col = 0; col < kCols; ++col) {
            Plant& plant = board_[row][col];
            if (plant.type == PlantType::None) {
                continue;
            }

            ++plant.timer;

            switch (plant.type) {
                case PlantType::Sunflower:
                    if (plant.timer % kSunflowerInterval == 0) {
                        sun_ += kSunflowerAmount;
                        std::ostringstream oss;
                        oss << "Sunflower at (" << row + 1 << "," << col + 1 << ") made +25 sun.";
                        logEvent(oss.str());
                    }
                    break;
                case PlantType::Peashooter:
                    attackLaneFromPlant(row, col, 4, 0);
                    break;
                case PlantType::WallNut:
                    break;
                case PlantType::IcePea:
                    attackLaneFromPlant(row, col, 3, 2);
                    break;
                case PlantType::CherryBomb:
                case PlantType::None:
                default:
                    break;
            }
        }
    }
}

void Game::attackLaneFromPlant(int row, int col, int damage, int slowTurns) {
    Zombie* target = nullptr;
    for (Zombie& zombie : zombies_) {
        if (zombie.hp <= 0 || zombie.row != row || zombie.col < col) {
            continue;
        }

        if (target == nullptr || zombie.col < target->col || (zombie.col == target->col && zombie.id < target->id)) {
            target = &zombie;
        }
    }

    if (target == nullptr) {
        return;
    }

    target->hp -= damage;
    if (slowTurns > 0) {
        target->slowTurns = std::max(target->slowTurns, slowTurns);
    }

    std::ostringstream oss;
    oss << plantName(board_[row][col].type) << " at (" << row + 1 << "," << col + 1 << ") hit "
        << zombieName(target->type) << " in lane " << row + 1 << " for " << damage << " damage";
    if (slowTurns > 0) {
        oss << " and slowed it";
    }
    oss << ".";
    logEvent(oss.str());
}

void Game::resolveZombiePhase() {
    std::sort(zombies_.begin(), zombies_.end(), [](const Zombie& left, const Zombie& right) {
        if (left.col != right.col) {
            return left.col < right.col;
        }
        if (left.row != right.row) {
            return left.row < right.row;
        }
        return left.id < right.id;
    });

    for (Zombie& zombie : zombies_) {
        if (zombie.hp <= 0) {
            continue;
        }

        if (zombie.col >= 0 && zombie.col < kCols && hasPlant(zombie.row, zombie.col)) {
            Plant& plant = board_[zombie.row][zombie.col];
            plant.hp -= zombie.damage;

            std::ostringstream oss;
            oss << zombieName(zombie.type) << " in lane " << zombie.row + 1 << " bit "
                << plantName(plant.type) << " at (" << zombie.row + 1 << "," << zombie.col + 1
                << ") for " << zombie.damage << " damage.";
            logEvent(oss.str());

            if (plant.hp <= 0) {
                std::ostringstream destroyMessage;
                destroyMessage << plantName(plant.type) << " at (" << zombie.row + 1 << ","
                               << zombie.col + 1 << ") was eaten.";
                logEvent(destroyMessage.str());
                plant = {};
            }
        } else {
            const int effectiveInterval = zombie.moveInterval + (zombie.slowTurns > 0 ? 1 : 0);
            ++zombie.moveProgress;

            if (zombie.moveProgress >= effectiveInterval) {
                zombie.moveProgress = 0;
                --zombie.col;

                if (zombie.col < 0) {
                    lost_ = true;
                    logEvent("A zombie reached the house. Game over.");
                    return;
                }
            }
        }

        if (zombie.slowTurns > 0) {
            --zombie.slowTurns;
        }
    }
}

void Game::spawnZombies() {
    if (turn_ >= kGoalTurns) {
        return;
    }

    int spawnCount = plannedSpawnsForTurn();
    const int alive = livingZombieCount();
    const int aliveCap = 8 + (turn_ / 2);
    if (alive >= aliveCap) {
        return;
    }

    spawnCount = std::min(spawnCount, aliveCap - alive);
    if (spawnCount <= 0) {
        return;
    }

    std::uniform_int_distribution<int> rowDist(0, kRows - 1);

    for (int i = 0; i < spawnCount; ++i) {
        const int row = rowDist(rng_);
        const ZombieType type = chooseZombieType();
        zombies_.push_back(makeZombie(type, row));

        std::ostringstream oss;
        oss << zombieName(type) << " entered lane " << row + 1 << ".";
        logEvent(oss.str());
    }
}

void Game::sweepDefeatedZombies() {
    auto it = std::remove_if(zombies_.begin(), zombies_.end(), [this](const Zombie& zombie) {
        if (zombie.hp > 0) {
            return false;
        }

        std::ostringstream oss;
        oss << zombieName(zombie.type) << " in lane " << zombie.row + 1 << " was defeated.";
        logEvent(oss.str());
        return true;
    });

    zombies_.erase(it, zombies_.end());
}

void Game::tryPlant(PlantType type, int row, int col) {
    if (!inBounds(row, col)) {
        std::cout << "Coordinates are out of range. Rows are 1-5, columns are 1-9.\n";
        return;
    }

    if (hasPlant(row, col)) {
        std::cout << "That tile already has a plant.\n";
        return;
    }

    if (hasZombieAt(row, col)) {
        std::cout << "You cannot plant on a tile already occupied by a zombie.\n";
        return;
    }

    const int cost = plantCost(type);
    if (sun_ < cost) {
        std::cout << "Not enough sun. Need " << cost << ", but only have " << sun_ << ".\n";
        return;
    }

    sun_ -= cost;

    if (type == PlantType::CherryBomb) {
        triggerCherryBomb(row, col);
        return;
    }

    board_[row][col].type = type;
    board_[row][col].hp = plantMaxHp(type);
    board_[row][col].timer = 0;

    std::cout << plantName(type) << " planted at lane " << row + 1 << ", column " << col + 1
              << ".\n";
}

void Game::tryRemove(int row, int col) {
    if (!inBounds(row, col)) {
        std::cout << "Coordinates are out of range. Rows are 1-5, columns are 1-9.\n";
        return;
    }

    if (!hasPlant(row, col)) {
        std::cout << "There is no plant on that tile.\n";
        return;
    }

    std::cout << plantName(board_[row][col].type) << " removed from lane " << row + 1
              << ", column " << col + 1 << ".\n";
    board_[row][col] = {};
}

void Game::triggerCherryBomb(int row, int col) {
    int hits = 0;
    for (Zombie& zombie : zombies_) {
        if (zombie.hp <= 0) {
            continue;
        }

        if (zombie.row >= row - 1 && zombie.row <= row + 1 && zombie.col >= col - 1 &&
            zombie.col <= col + 1) {
            zombie.hp = 0;
            ++hits;
        }
    }

    sweepDefeatedZombies();

    std::cout << "Cherry Bomb exploded at lane " << row + 1 << ", column " << col + 1 << ". ";
    if (hits == 0) {
        std::cout << "No zombies were in range.\n";
    } else {
        std::cout << "It defeated " << hits << " zombie(s).\n";
    }
}

void Game::printState() const {
    std::cout << "\n============================================================\n";
    std::cout << "Plants vs. Zombies - Console Edition\n";
    std::cout << "Turn: " << turn_ << "/" << kGoalTurns;
    if (turn_ >= kGoalTurns) {
        std::cout << " (cleanup phase)";
    }
    std::cout << "   Sun: " << sun_ << "   Zombies alive: " << livingZombieCount() << "\n";
    std::cout << "House is on the LEFT. Stop the zombies from reaching it.\n";

    printBoard();
    printShop();
    printLaneSummary();
    printEvents();

    std::cout << "Commands: plant <type> <row> <col>, remove <row> <col>, next, help, quit\n";
}

void Game::printBoard() const {
    std::cout << "\nBoard\n";
    std::cout << "      ";
    for (int col = 1; col <= kCols; ++col) {
        std::cout << " " << std::setw(2) << col << "  ";
    }
    std::cout << "\n";

    for (int row = 0; row < kRows; ++row) {
        std::cout << "L" << row + 1 << "    ";
        for (int col = 0; col < kCols; ++col) {
            std::cout << "[" << plantSymbol(board_[row][col].type) << zombieMarkerAt(row, col)
                      << "]";
        }
        std::cout << "\n";
    }

    std::cout << "      [plant][zombie], '.' means empty, number means stacked zombies.\n";
}

void Game::printShop() const {
    std::cout << "\nShop\n";
    std::cout << "  sf  : Sunflower   cost 50   hp 10   +25 sun every 2 turns\n";
    std::cout << "  pea : Peashooter  cost 100  hp 12   4 damage each turn\n";
    std::cout << "  wall: Wall-nut    cost 75   hp 40   sturdy blocker\n";
    std::cout << "  ice : Ice Pea     cost 125  hp 12   3 damage + slow\n";
    std::cout << "  bomb: Cherry Bomb cost 125          instant 3x3 explosion\n";
}

void Game::printHelp() const {
    std::cout << "\nHelp\n";
    std::cout << "  plant <type> <row> <col>\n";
    std::cout << "  remove <row> <col>\n";
    std::cout << "  next\n";
    std::cout << "  quit\n";
    std::cout << "\nPlant types: sf, pea, wall, ice, bomb\n";
    std::cout << "Rows are 1-5 and columns are 1-9.\n";
    std::cout << "Tip: open with a Sunflower, then protect lanes with Peashooters and Wall-nuts.\n";
}

void Game::printLaneSummary() const {
    std::cout << "\nLanes\n";
    for (int row = 0; row < kRows; ++row) {
        std::vector<const Zombie*> lane;
        for (const Zombie& zombie : zombies_) {
            if (zombie.hp > 0 && zombie.row == row) {
                lane.push_back(&zombie);
            }
        }

        std::sort(lane.begin(), lane.end(), [](const Zombie* left, const Zombie* right) {
            if (left->col != right->col) {
                return left->col < right->col;
            }
            return left->id < right->id;
        });

        std::cout << "  Lane " << row + 1 << ": ";
        if (lane.empty()) {
            std::cout << "clear";
        } else {
            for (std::size_t i = 0; i < lane.size(); ++i) {
                const Zombie& zombie = *lane[i];
                if (i > 0) {
                    std::cout << ", ";
                }
                std::cout << zombieName(zombie.type) << "@c" << zombie.col + 1 << " hp "
                          << zombie.hp;
                if (zombie.slowTurns > 0) {
                    std::cout << " slowed";
                }
            }
        }
        std::cout << "\n";
    }
}

void Game::printEvents() const {
    if (lastEvents_.empty()) {
        return;
    }

    std::cout << "\nRecent events\n";
    const std::size_t start =
        lastEvents_.size() > static_cast<std::size_t>(kEventLimit)
            ? lastEvents_.size() - static_cast<std::size_t>(kEventLimit)
            : 0;

    for (std::size_t i = start; i < lastEvents_.size(); ++i) {
        std::cout << "  - " << lastEvents_[i] << "\n";
    }
}

void Game::printGameOver() const {
    std::cout << "\n============================================================\n";
    if (won_) {
        std::cout << "You win! The lawn is safe.\n";
    } else if (lost_) {
        std::cout << "The zombies got through.\n";
    } else {
        std::cout << "Game ended.\n";
    }
}

bool Game::inBounds(int row, int col) const {
    return row >= 0 && row < kRows && col >= 0 && col < kCols;
}

bool Game::hasPlant(int row, int col) const {
    return board_[row][col].type != PlantType::None;
}

bool Game::hasZombieAt(int row, int col) const {
    for (const Zombie& zombie : zombies_) {
        if (zombie.hp > 0 && zombie.row == row && zombie.col == col) {
            return true;
        }
    }
    return false;
}

int Game::livingZombieCount() const {
    return static_cast<int>(std::count_if(zombies_.begin(), zombies_.end(), [](const Zombie& zombie) {
        return zombie.hp > 0;
    }));
}

int Game::plannedSpawnsForTurn() const {
    if (turn_ <= 1) {
        return 1;
    }
    if (turn_ <= 5) {
        return 1;
    }
    if (turn_ <= 10) {
        return turn_ % 3 == 0 ? 2 : 1;
    }
    if (turn_ <= 15) {
        return turn_ % 2 == 0 ? 2 : 1;
    }
    return turn_ % 3 == 0 ? 3 : 2;
}

char Game::zombieMarkerAt(int row, int col) const {
    int count = 0;
    char singleMarker = '.';

    for (const Zombie& zombie : zombies_) {
        if (zombie.hp > 0 && zombie.row == row && zombie.col == col) {
            ++count;
            singleMarker = zombieSymbol(zombie.type);
        }
    }

    if (count == 0) {
        return '.';
    }
    if (count == 1) {
        return singleMarker;
    }
    if (count < 10) {
        return static_cast<char>('0' + count);
    }
    return '+';
}

ZombieType Game::chooseZombieType() {
    std::uniform_int_distribution<int> roll(1, 100);
    const int value = roll(rng_);

    if (turn_ < 5) {
        return ZombieType::Basic;
    }
    if (turn_ < 9) {
        if (value <= 65) {
            return ZombieType::Basic;
        }
        if (value <= 90) {
            return ZombieType::Conehead;
        }
        return ZombieType::Runner;
    }
    if (turn_ < 14) {
        if (value <= 40) {
            return ZombieType::Basic;
        }
        if (value <= 70) {
            return ZombieType::Conehead;
        }
        if (value <= 88) {
            return ZombieType::Runner;
        }
        return ZombieType::Buckethead;
    }

    if (value <= 25) {
        return ZombieType::Basic;
    }
    if (value <= 55) {
        return ZombieType::Conehead;
    }
    if (value <= 75) {
        return ZombieType::Runner;
    }
    return ZombieType::Buckethead;
}

Zombie Game::makeZombie(ZombieType type, int row) {
    Zombie zombie;
    zombie.id = nextZombieId_++;
    zombie.type = type;
    zombie.row = row;
    zombie.col = kCols - 1;

    switch (type) {
        case ZombieType::Basic:
            zombie.hp = 10;
            zombie.damage = 4;
            zombie.moveInterval = 1;
            break;
        case ZombieType::Conehead:
            zombie.hp = 18;
            zombie.damage = 4;
            zombie.moveInterval = 1;
            break;
        case ZombieType::Buckethead:
            zombie.hp = 30;
            zombie.damage = 5;
            zombie.moveInterval = 2;
            break;
        case ZombieType::Runner:
            zombie.hp = 8;
            zombie.damage = 3;
            zombie.moveInterval = 1;
            break;
    }

    zombie.moveProgress = zombie.moveInterval - 1;
    return zombie;
}

void Game::updateWinState() {
    if (!lost_ && turn_ >= kGoalTurns && zombies_.empty()) {
        won_ = true;
    }
}

void Game::logEvent(const std::string& event) {
    lastEvents_.push_back(event);
}

}  // namespace

int main() {
    Game game;
    game.run();
    return 0;
}
