from game_engine import GameEngine


def test_standard_round():
    engine = GameEngine()
    engine.update_settings(starting_lives=10, rules={
        "clash_penalty": True,
        "exact_mean_penalty": True,
        "duel_zero_hundred": True
    })
    
    # 3 players
    p1 = engine.register_or_reconnect_player("p1", "Alice")
    p2 = engine.register_or_reconnect_player("p2", "Bob")
    p3 = engine.register_or_reconnect_player("p3", "Charlie")
    
    engine.start_game()
    assert engine.phase == "ROUND_ACTIVE"
    
    # Alice: 20, Bob: 30, Charlie: 40
    # Mean: 30.0. Target (2/3): 20.0
    engine.submit_guess("p1", 20)
    engine.submit_guess("p2", 30)
    engine.submit_guess("p3", 40)
    
    res = engine.calculate_and_reveal_round()
    assert res["winners"] == ["Alice"]
    # Bob guessed 30, which is exact rounded mean (30)!
    # With exact_mean_penalty=True, non-winners lose 2 lives!
    assert p1.lives == 10
    assert p2.lives == 8  # 10 - 2
    assert p3.lives == 8  # 10 - 2
    print("[PASS] test_standard_round passed!")


def test_clash_rule():
    engine = GameEngine()
    p1 = engine.register_or_reconnect_player("p1", "Alice")
    p2 = engine.register_or_reconnect_player("p2", "Bob")
    p3 = engine.register_or_reconnect_player("p3", "Charlie")
    engine.start_game()
    
    # Alice: 20, Bob: 20 (clash!), Charlie: 25
    # Mean: (20+20+25)/3 = 21.67. Target: 14.44
    # Closest is 20, but Alice & Bob clashed! So Charlie should win!
    engine.submit_guess("p1", 20)
    engine.submit_guess("p2", 20)
    engine.submit_guess("p3", 25)
    
    res = engine.calculate_and_reveal_round()
    assert res["winners"] == ["Charlie"]
    assert p1.lives == 9
    assert p2.lives == 9
    assert p3.lives == 10
    print("[PASS] test_clash_rule passed!")


def test_duel_rule():
    engine = GameEngine()
    p1 = engine.register_or_reconnect_player("p1", "Alice")
    p2 = engine.register_or_reconnect_player("p2", "Bob")
    engine.start_game()
    
    # 2 players left: 0 and 100 -> 100 wins!
    engine.submit_guess("p1", 0)
    engine.submit_guess("p2", 100)
    
    res = engine.calculate_and_reveal_round()
    assert res["winners"] == ["Bob"]
    assert p2.lives == 10
    assert p1.lives == 9
    print("[PASS] test_duel_rule passed!")


def test_elimination_and_game_over():
    engine = GameEngine()
    engine.update_settings(starting_lives=1)
    p1 = engine.register_or_reconnect_player("p1", "Alice")
    p2 = engine.register_or_reconnect_player("p2", "Bob")
    engine.start_game()
    
    engine.submit_guess("p1", 0)
    engine.submit_guess("p2", 50)
    # Mean: 25. Target: 16.67. Alice (0 diff 16.67), Bob (50 diff 33.33) -> Alice wins!
    # Bob loses 1 life -> 0 lives -> eliminated!
    res = engine.calculate_and_reveal_round()
    assert res["winners"] == ["Alice"]
    assert not p2.is_alive
    assert engine.phase == "GAME_OVER"
    assert engine.game_winner == "Alice"
    print("[PASS] test_elimination_and_game_over passed!")


if __name__ == "__main__":
    test_standard_round()
    test_clash_rule()
    test_duel_rule()
    test_elimination_and_game_over()
    print("All engine tests passed successfully!")
